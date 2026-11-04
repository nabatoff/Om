-- Коды, добавленные автообновлением до того, как функция научилась определять отрасль.
UPDATE public.crm_ens_tru_national_exemption_codes
SET industry = 'Программное обеспечение и электроника'
WHERE industry = 'Не указана' AND name = 'Цифровой объект реестра доверенного ПО';
