import { z } from 'zod';

export const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

export const updateMeSchema = z.object({
  languagePairId: z.string().uuid(),
  level: z.enum(cefrLevels),
});
