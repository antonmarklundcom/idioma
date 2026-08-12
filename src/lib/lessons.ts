import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { languagePairs, lessonContent, type CefrLevel } from '@/lib/db/schema';

export type LessonSummary = {
  id: string;
  level: CefrLevel;
  topic: string;
  title: string;
  position: number;
};

// PLAN.md §2 /api/lessons: list lesson_content for the user's language pair,
// filtered by level/topic. Never lists across pairs - content is pair-specific.
export async function getLessonsForPair(
  languagePairId: string,
  filters: { level?: CefrLevel; topic?: string } = {},
): Promise<LessonSummary[]> {
  const conditions = [eq(lessonContent.languagePairId, languagePairId)];
  if (filters.level) conditions.push(eq(lessonContent.level, filters.level));
  if (filters.topic) conditions.push(eq(lessonContent.topic, filters.topic));

  return db
    .select({
      id: lessonContent.id,
      level: lessonContent.level,
      topic: lessonContent.topic,
      title: lessonContent.title,
      position: lessonContent.position,
    })
    .from(lessonContent)
    .where(and(...conditions))
    .orderBy(asc(lessonContent.level), asc(lessonContent.position), asc(lessonContent.title));
}

// Distinct topics for a pair, used to populate the browser's topic filter.
export async function getTopicsForPair(languagePairId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ topic: lessonContent.topic })
    .from(lessonContent)
    .where(eq(lessonContent.languagePairId, languagePairId));
  return rows.map((r) => r.topic).sort();
}

// Returns null (not a 500) if the lesson doesn't exist OR belongs to a
// different language pair - both are "not found" from the caller's perspective.
export async function getLessonForPair(lessonId: string, languagePairId: string) {
  const [row] = await db
    .select()
    .from(lessonContent)
    .where(and(eq(lessonContent.id, lessonId), eq(lessonContent.languagePairId, languagePairId)));
  return row ?? null;
}

export type AdminLessonSummary = LessonSummary & {
  languagePairCode: string;
  createdAt: Date;
};

// Every lesson across every pair, for the admin import panel (§2 /api/admin/content).
export async function getAllLessonsForAdmin(): Promise<AdminLessonSummary[]> {
  return db
    .select({
      id: lessonContent.id,
      languagePairCode: languagePairs.code,
      level: lessonContent.level,
      topic: lessonContent.topic,
      title: lessonContent.title,
      position: lessonContent.position,
      createdAt: lessonContent.createdAt,
    })
    .from(lessonContent)
    .innerJoin(languagePairs, eq(languagePairs.id, lessonContent.languagePairId))
    .orderBy(asc(languagePairs.code), asc(lessonContent.level), asc(lessonContent.position));
}
