#!/usr/bin/env node
// scripts/db-dump.mjs — снять gzip-дамп prod-БД одной командой.
//
// Использование:
//   npm run db:backup
//
// Кладёт файл вида ~/Backups/ff-finance/YYYY-MM-DD-HHMM.sql.gz.
// Connection-URL берётся так же, как в db-push.mjs:
//   1) FF_DB_URL (env), либо
//   2) ~/.config/ff-finance/connection.
//
// Зачем: Supabase free tier даёт daily backup и retention 7 дней. Этого
// мало, если что-то пошло не так позже недели. Скрипт позволяет раз в
// месяц вручную снять снимок, который останется на диске владельца.

import { readFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

const CONFIG_PATH = join(homedir(), '.config', 'ff-finance', 'connection')
const BACKUP_DIR = join(homedir(), 'Backups', 'ff-finance')

async function loadUrl() {
  if (process.env.FF_DB_URL && process.env.FF_DB_URL.trim()) {
    return process.env.FF_DB_URL.trim()
  }
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8')
    const url = raw.trim()
    if (!url.startsWith('postgresql://')) {
      throw new Error('connection не выглядит как postgresql://...')
    }
    return url
  } catch (e) {
    console.error(`Не нашёл connection: ни FF_DB_URL, ни ${CONFIG_PATH}.`)
    console.error('Подсказка по первичной настройке — в комментариях scripts/db-push.mjs.')
    throw e
  }
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

async function main() {
  const url = await loadUrl()
  await mkdir(BACKUP_DIR, { recursive: true })
  const outPath = join(BACKUP_DIR, `${timestamp()}.sql.gz`)

  console.log(`→ pg_dump на ${url.replace(/:[^:@/]+@/, ':***@')}`)
  console.log(`→ ${outPath}`)

  // pg_dump --no-owner --no-acl --schema=public --schema=auth
  // (auth — чтобы при restore оставались юзеры; --no-owner/--no-acl —
  //  чтобы dump был портативен на другой Supabase-проект.)
  const proc = spawn(
    'pg_dump',
    ['--no-owner', '--no-acl', '--schema=public', '--schema=auth', url],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )

  await pipeline(proc.stdout, createGzip({ level: 9 }), createWriteStream(outPath))

  const code = await new Promise((resolve) => proc.on('close', resolve))
  if (code !== 0) {
    console.error(`pg_dump вышел с кодом ${code}`)
    process.exit(code ?? 1)
  }
  console.log(`✓ дамп готов: ${outPath}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
