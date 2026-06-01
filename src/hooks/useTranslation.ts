import { useMemo } from 'react';
import { translations } from '../translations';
import { Language } from '../types';

export const useTranslation = (language: Language) => {
  const t = useMemo(() => {
    return translations[language] || translations['en-US'];
  }, [language]);

  return t;
};
