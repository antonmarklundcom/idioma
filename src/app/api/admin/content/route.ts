import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { languagePairs, lessonContent } from '@/lib/db/schema';
import { getAllLessonsForAdmin } from '@/lib/lessons';
import {
  lessonDeleteSchema,
  lessonImportItemSchema,
  lessonUpdateSchema,
  type LessonImportItem,
} from '@/lib/zodSchemas';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: 'Not signed in', code: 'unauthorized', status: 401 } as const;
  if (session.user.role !== 'admin') {
    return { error: 'Admins only', code: 'forbidden', status: 403 } as const;
  }
  return { userId: session.user.id } as const;
}

// db.batch() requires a statically non-empty tuple type; the batch here is
// always built from a runtime-length array, so this narrows it in one place.
function toBatchTuple<T>(items: T[]): [T, ...T[]] {
  if (items.length === 0) throw new Error('toBatchTuple: empty array');
  return items as [T, ...T[]];
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  return NextResponse.json({ lessons: await getAllLessonsForAdmin() });
}

type ImportItemResult = {
  index: number;
  title?: string;
  ok: boolean;
  errors?: string[];
};

// PLAN.md §2: POST takes a JSON array for bulk import, Zod-validates EVERY item
// before writing any of them. A partially-imported batch is worse than a
// rejected one, so this only ever inserts once every item is confirmed valid -
// wrong `languagePairCode`, duplicate title, or a bad shape rejects the whole
// batch with per-item detail, never a partial commit.
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json(
      { error: 'Body must be a non-empty JSON array of lessons', code: 'validation_error' },
      { status: 400 },
    );
  }

  const parsed = body.map((item, index) => ({
    index,
    result: lessonImportItemSchema.safeParse(item),
  }));

  const validItems = parsed
    .filter((p): p is { index: number; result: { success: true; data: LessonImportItem } } => p.result.success)
    .map((p) => ({ index: p.index, data: p.result.data }));

  const codes = [...new Set(validItems.map((v) => v.data.languagePairCode))];
  const pairs = codes.length
    ? await db
        .select({ id: languagePairs.id, code: languagePairs.code })
        .from(languagePairs)
        .where(inArray(languagePairs.code, codes))
    : [];
  const pairIdByCode = new Map(pairs.map((p) => [p.code, p.id]));

  const titles = [...new Set(validItems.map((v) => v.data.title))];
  const existing = titles.length
    ? await db.select({ title: lessonContent.title }).from(lessonContent).where(inArray(lessonContent.title, titles))
    : [];
  const existingTitles = new Set(existing.map((e) => e.title));

  const seenInBatch = new Set<string>();

  const results: ImportItemResult[] = parsed.map(({ index, result }) => {
    if (!result.success) {
      return {
        index,
        ok: false,
        errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      };
    }
    const { data } = result;
    const errors: string[] = [];
    if (!pairIdByCode.has(data.languagePairCode)) {
      errors.push(`unknown languagePairCode "${data.languagePairCode}"`);
    }
    if (existingTitles.has(data.title)) {
      errors.push(`a lesson titled "${data.title}" already exists`);
    }
    if (seenInBatch.has(data.title)) {
      errors.push(`duplicate title "${data.title}" within this batch`);
    }
    seenInBatch.add(data.title);

    return errors.length > 0
      ? { index, title: data.title, ok: false, errors }
      : { index, title: data.title, ok: true };
  });

  if (results.some((r) => !r.ok)) {
    return NextResponse.json(
      {
        error: 'Import rejected: fix every item and retry - nothing was written',
        code: 'validation_error',
        results,
      },
      { status: 400 },
    );
  }

  const inserts = validItems.map(({ data }) =>
    db.insert(lessonContent).values({
      languagePairId: pairIdByCode.get(data.languagePairCode)!,
      level: data.level,
      topic: data.topic,
      title: data.title,
      position: data.position,
      content: data.content,
    }),
  );
  await db.batch(toBatchTuple(inserts));

  return NextResponse.json({ imported: results.length, results });
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = lessonUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid update', code: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update', code: 'validation_error' }, { status: 400 });
  }

  const [updated] = await db.update(lessonContent).set(patch).where(eq(lessonContent.id, id)).returning();
  if (!updated) {
    return NextResponse.json({ error: 'Lesson not found', code: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ lesson: updated });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = lessonDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', code: 'validation_error' }, { status: 400 });
  }

  const [deleted] = await db
    .delete(lessonContent)
    .where(eq(lessonContent.id, parsed.data.id))
    .returning({ id: lessonContent.id });
  if (!deleted) {
    return NextResponse.json({ error: 'Lesson not found', code: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: deleted.id });
}
