-- Роль счёта: накопления (wallet) или бюджетный конверт месяца (monthly_budget).
-- monthly_amount хранит месячный лимит конверта (только для monthly_budget,
-- для wallet — NULL). Менять баланс самим конвертом мы не будем — обнуление/
-- пополнение в начале месяца оставлено для следующей фазы.

alter table public.accounts
  add column role text not null default 'wallet'
    check (role in ('wallet', 'monthly_budget'));

alter table public.accounts
  add column monthly_amount numeric(14, 2) null;

alter table public.accounts
  add constraint accounts_monthly_amount_required
  check (
    (role = 'wallet'         and monthly_amount is null) or
    (role = 'monthly_budget' and monthly_amount is not null and monthly_amount > 0)
  );

comment on column public.accounts.role is
  'wallet — обычный счёт-накопления; monthly_budget — конверт месяца с фиксированным лимитом.';
comment on column public.accounts.monthly_amount is
  'Месячный лимит для конвертов (monthly_budget). NULL для wallet.';
