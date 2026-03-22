export const MANUFACTURERS = [
  'Otis',
  'Schindler',
  'Kone',
  'ThyssenKrupp',
  'Orona',
  'Schumacher',
];

export const COMMON_ERROR_CODES = [
  {
    code: 'E01',
    manufacturer: 'Otis',
    description: 'Błąd komunikacji z napędem drzwi.',
    solution: 'Sprawdź połączenia kablowe napędu drzwi i zasilanie sterownika.',
  },
  {
    code: 'E12',
    manufacturer: 'Schindler',
    description: 'Przekroczenie czasu otwarcia drzwi.',
    solution: 'Sprawdź czy fotokomórka nie jest zasłonięta lub czy próg nie jest zablokowany.',
  },
  {
    code: 'F1',
    manufacturer: 'Kone',
    description: 'Błąd obwodu bezpieczeństwa.',
    solution: 'Sprawdź wszystkie kontakty bezpieczeństwa (drzwi przystankowe, kabinowe, ogranicznik).',
  },
];

export const SYSTEM_PROMPT = `Jesteś asystentem technicznym firmy SR Serwis z Gdańska. 
Twoim zadaniem jest pomoc serwisantom wind i schodów ruchomych. 
Udzielaj precyzyjnych odpowiedzi na podstawie norm (np. EN 81-20, EN 81-50), instrukcji producentów i dobrych praktyk. 
Jeśli nie znasz odpowiedzi, zasugeruj sprawdzenie konkretnej dokumentacji lub kontakt z biurem. 
Odpowiadaj w języku polskim, technicznie ale zrozumiale.`;
