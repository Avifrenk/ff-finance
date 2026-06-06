#!/usr/bin/env node
// scripts/wipe-data.mjs — одноразовая очистка устаревших данных в prod-БД.
//
// Сносит: operations, transfers, operation_schedules, accounts.
// Сохраняет: goals, goal_contributions, budgets, categories, household, profiles.
//
// goal_contributions.source_operation_id → ON DELETE SET NULL (цели уцелеют).
//
// Использование:
//   npm run db:wipe          # покажет, что будет удалено, и ничего не сделает
//   npm run db:wipe -- --yes # реально удалит

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

const CONFIG_PATH = join(homedir(), '.config', 'ff-finance', 'connection')

async function loadUrl() {
  if (process.env.FF_DB_URL && process.env.FF_DB_URL.trim()) {
    return process.env.FF_DB_URL.trim()
  }
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8')
    const url = raw.trim()
    if (!url.startsWith('postgresql://')) {
      throw new Error(`Файл ${CONFIG_PATH} не похож на postgresql://...-URL.`)
    }
    return url
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      console.error(`Не нашёл connection-URL: ${CONFIG_PATH}`)
      process.exit(2)
    }
    throw e
  }
}

const dryRun = !process.argv.includes('--yes')
const url = await loadUrl()
const masked = url.replace(/:[^:@]+@/, ':***@')
console.log(`→ ${dryRun ? 'DRY-RUN на' : 'WIPE на'} ${masked}`)

const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  const counts = await client.query(`
    select
      (select count(*) from public.operations)          as operations,
      (select count(*) from public.transfers)           as transfers,
      (select count(*) from public.operation_schedules) as schedules,
      (select count(*) from public.accounts)            as accounts,
      (select count(*) from public.goals)               as goals_keep,
      (select count(*) from public.goal_contributions)  as contributions_keep,
      (select count(*) from public.budgets)             as budgets_keep
  `)
  const r = counts.rows[0]
  console.log('Сейчас в БД:')
  console.log(`  operations:           ${r.operations}  (будет удалено)`)
  console.log(`  transfers:            ${r.transfers}  (будет удалено)`)
  console.log(`  operation_schedules:  ${r.schedules}  (будет удалено)`)
  console.log(`  accounts:             ${r.accounts}  (будет удалено)`)
  console.log(`  goals:                ${r.goals_keep}  (сохраняется)`)
  console.log(`  goal_contributions:   ${r.contributions_keep}  (сохраняется, source_operation_id обнулится)`)
  console.log(`  budgets:              ${r.budgets_keep}  (сохраняется)`)

  if (dryRun) {
    console.log('\nЭто dry-run. Для реального удаления: npm run db:wipe -- --yes')
    await client.end()
    process.exit(0)
  }

  await client.query('begin')
  // Порядок важен из-за ON DELETE RESTRICT на FK к accounts.
  // transfers сначала — их удаление каскадно удалит связанные operations (transfer_id ON DELETE CASCADE).
  const t = await client.query('delete from public.transfers')
  const o = await client.query('delete from public.operations')
  const s = await client.query('delete from public.operation_schedules')
  const a = await client.query('delete from public.accounts')
  await client.query('commit')

  console.log('\nУдалено:')
  console.log(`  transfers:            ${t.rowCount}`)
  console.log(`  operations:           ${o.rowCount}`)
  console.log(`  operation_schedules:  ${s.rowCount}`)
  console.log(`  accounts:             ${a.rowCount}`)
  console.log('\nГотово. Открой приложение — общий баланс будет 0, цели на месте.')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('Ошибка:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
