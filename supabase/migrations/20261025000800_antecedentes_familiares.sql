-- Antecedentes familiares: nombres sin el sufijo "(familiar)"; el grupo "familiar" ya los separa
update public.lista_items set nombre = regexp_replace(nombre, '\s*\(familiar\)$', '')
where lista = 'antecedente_medico' and grupo = 'familiar';
