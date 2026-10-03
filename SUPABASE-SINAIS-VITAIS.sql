-- BODY LAB • SINAIS VITAIS
-- Execute uma única vez no SQL Editor do Supabase.

alter table public.anthropometry
  add column if not exists spo2_percent numeric(5,2),
  add column if not exists heart_rate_bpm integer,
  add column if not exists vital_context text,
  add column if not exists measured_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'anthropometry_spo2_check'
  ) then
    alter table public.anthropometry
      add constraint anthropometry_spo2_check
      check (spo2_percent is null or (spo2_percent >= 0 and spo2_percent <= 100));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'anthropometry_heart_rate_check'
  ) then
    alter table public.anthropometry
      add constraint anthropometry_heart_rate_check
      check (heart_rate_bpm is null or (heart_rate_bpm > 0 and heart_rate_bpm <= 300));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'anthropometry_vital_context_check'
  ) then
    alter table public.anthropometry
      add constraint anthropometry_vital_context_check
      check (
        vital_context is null
        or vital_context in ('rest','pre_exercise','post_exercise','other')
      );
  end if;
end $$;

comment on column public.anthropometry.spo2_percent is 'Saturacao periferica de oxigenio (SpO2) em percentual.';
comment on column public.anthropometry.heart_rate_bpm is 'Frequencia cardiaca registrada no momento da leitura.';
comment on column public.anthropometry.vital_context is 'Contexto da leitura: repouso, pre-esforco, pos-esforco ou outro.';
comment on column public.anthropometry.measured_at is 'Data e horario exatos da leitura de sinais vitais.';
