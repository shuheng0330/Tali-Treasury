revoke all on public.payroll_configurations from public, anon, authenticated;
grant select, insert on public.payroll_configurations to service_role;
