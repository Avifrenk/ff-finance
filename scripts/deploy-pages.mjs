#!/usr/bin/env node
// scripts/deploy-pages.mjs — задеплоить dist/ на GitHub Pages.
//
// Использование: npm run deploy
//
// Делает локальный build с VITE_BASE_PATH=/ff-finance/, копирует
// index.html → 404.html (SPA-trick GitHub Pages), коммитит результат
// в orphan-репозиторий в /tmp, force-пушит на ветку gh-pages в
// https://github.com/Avifrenk/ff-finance.git. GitHub Pages поднимает
// сайт через ~30 секунд.
//
// Требования:
//   - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_VAPID_PUBLIC_KEY
//     в .env.local — Vite зашьёт их в bundle на этапе build.
//   - gh CLI залогинен в Avifrenk (используется для git push через HTTPS
//     с auth-token gh CLI).

import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const REPO = 'https://github.com/Avifrenk/ff-finance.git'
const BASE = '/ff-finance/'
const PAGES_URL = 'https://avifrenk.github.io/ff-finance/'

function run(cmd, opts = {}) {
  console.log('$', cmd)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

console.log(`→ build с base=${BASE}`)
run('npm run build', { cwd: root, env: { ...process.env, VITE_BASE_PATH: BASE } })

console.log('→ index.html → 404.html (SPA fallback)')
run(`cp ${join(root, 'dist/index.html')} ${join(root, 'dist/404.html')}`)

const work = mkdtempSync(join(tmpdir(), 'ff-pages-'))
console.log(`→ orphan-репо в ${work}`)
try {
  run('git init -b gh-pages', { cwd: work })
  cpSync(join(root, 'dist'), work, { recursive: true })
  writeFileSync(join(work, '.nojekyll'), '')
  run('git add -A', { cwd: work })
  run(
    "git -c user.email='avramshulga@gmail.com' -c user.name='Avi Frenkel' commit -m 'Deploy ff-finance to GitHub Pages'",
    { cwd: work },
  )
  run(`git remote add origin ${REPO}`, { cwd: work })
  run('git push -f origin gh-pages', { cwd: work })
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`✓ deploy запущен. Через ~30 сек: ${PAGES_URL}`)
