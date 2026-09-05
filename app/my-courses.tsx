'use client';
import { useState } from 'react';
import {
  BookOpen,
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Play,
  CheckCircle2,
  Layers,
  Pencil,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Progress } from '../components/ui/progress';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
type Row = Record<string, any>;
type Props = {
  courses: Row[];
  modules: Row[];
  lessons: Row[];
  admin: boolean;
  search: string;
  refresh: () => Promise<void>;
  openLesson: (lesson: Row) => void;
  editLesson: (lesson?: Row) => void;
};
export default function MyCourses({
  courses,
  modules,
  lessons,
  admin,
  search,
  refresh,
  openLesson,
  editLesson,
}: Props) {
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Existing lessons remain in their original categories; no silent content migration.
  const legacy = [
    ...new Set(lessons.filter((l) => !l.course_id).map((l) => l.category)),
  ].map((category) => ({
    id: 'legacy:' + category,
    title: category,
    summary: 'Short lessons. One clear next step.',
    level: 'Workspace quickstart',
    published: 1,
    legacy: true,
  }));
  const library: Row[] = [...courses, ...legacy].map((course) => {
    const items = lessons.filter((l) =>
      course.legacy
        ? !l.course_id && l.category === course.title
        : l.course_id === course.id,
    );
    const published = items.filter((l) => l.published);
    const completed = published.filter((l) => l.completed).length;
    return {
      ...course,
      items,
      total: published.length,
      completed,
      minutes: published.reduce((n, l) => n + l.duration, 0),
      progress: published.length
        ? Math.round((completed / published.length) * 100)
        : 0,
    };
  });
  const course = library.find((c) => c.id === selected);
  const visible = library.filter(
    (c) =>
      (c.title + ' ' + c.summary)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'progress'
          ? c.completed > 0 && c.completed < c.total
          : c.total > 0 && c.completed === c.total)),
  );
  const resume = library.find((c) => c.completed > 0 && c.completed < c.total);
  const editCourse = (value: Row) => {
    setError('');
    setEdit(value);
  };
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...edit,
          title: f.get('title'),
          summary: f.get('summary') || '',
          level: f.get('level') || 'Start here',
          position: Number(f.get('position')),
          published: f.get('published') === 'on',
        }),
      });
      const value = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(value.error);
      await refresh();
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const lessonItem = (l: Row, i: number) => (
    <div className="course-lesson" key={l.id}>
      <button onClick={() => openLesson(l)} className="course-lesson-main">
        <span className={'lesson-number ' + (l.completed ? 'done' : '')}>
          {l.completed ? (
            <CheckCircle2 size={18} />
          ) : (
            String(i + 1).padStart(2, '0')
          )}
        </span>
        <span>
          <strong>{l.title}</strong>
          <small>
            {l.duration} min ·{' '}
            {l.mime?.startsWith('video/')
              ? 'Video'
              : l.mime === 'application/pdf'
                ? 'Resource'
                : 'Lesson'}
            {!l.published ? ' · Draft' : ''}
          </small>
        </span>
        <Play size={15} className="ml-auto shrink-0" />
      </button>
      {admin && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={'Edit ' + l.title}
          onClick={() => editLesson(l)}
        >
          <Pencil size={15} />
        </Button>
      )}
    </div>
  );
  return (
    <div className="academy">
      {course ? (
        <>
          <Button variant="ghost" onClick={() => setSelected('')}>
            <ArrowLeft /> All my courses
          </Button>
          <section className="course-detail-hero">
            <div>
              <span className="eyebrow">
                {course.level}
                {!course.published ? ' · DRAFT' : ''}
              </span>
              <h2>{course.title}</h2>
              <p>{course.summary}</p>
              <div className="flex gap-3 mt-5 flex-wrap">
                {course.items.some((l: Row) => l.published && !l.completed) && (
                  <Button
                    onClick={() =>
                      openLesson(
                        course.items.find(
                          (l: Row) => l.published && !l.completed,
                        ),
                      )
                    }
                  >
                    Continue learning <ArrowUpRight />
                  </Button>
                )}
                {admin && !course.legacy && (
                  <Button
                    variant="secondary"
                    onClick={() => editCourse({ ...course, action: 'course' })}
                  >
                    <Pencil /> Edit course
                  </Button>
                )}
              </div>
            </div>
            <div className="course-progress">
              <strong>
                {course.progress}
                <span>%</span>
              </strong>
              <Progress value={course.progress} aria-label="Course progress" />
              <p>
                {course.completed} of {course.total} lessons complete
              </p>
            </div>
          </section>
          <div className="filters">
            <h3>Your next steps</h3>
            {admin && (
              <div className="flex gap-2 ml-auto flex-wrap">
                {!course.legacy && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      editCourse({ action: 'module', course_id: course.id })
                    }
                  >
                    <Layers /> Add module
                  </Button>
                )}
                <Button
                  onClick={() =>
                    editLesson({
                      course_id: course.legacy ? null : course.id,
                      category: course.title.slice(0, 60),
                    })
                  }
                >
                  <Plus /> Add lesson
                </Button>
              </div>
            )}
          </div>
          {modules
            .filter((m) => m.course_id === course.id)
            .map((m) => (
              <section className="panel mb-4" key={m.id}>
                <div className="panel-pad flex items-center justify-between">
                  <h3>{m.title}</h3>
                  {admin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => editCourse({ ...m, action: 'module' })}
                    >
                      Edit module
                    </Button>
                  )}
                </div>
                {course.items
                  .filter((l: Row) => l.module_id === m.id)
                  .map(lessonItem)}
                {!course.items.some((l: Row) => l.module_id === m.id) && (
                  <p className="panel-pad text-muted-foreground">
                    No lessons in this module yet.
                  </p>
                )}
              </section>
            ))}
          {course.items.some((l: Row) => !l.module_id) && (
            <section className="panel">
              {course.items.filter((l: Row) => !l.module_id).map(lessonItem)}
            </section>
          )}
          {!course.items.length && (
            <section className="panel panel-pad">
              <BookOpen className="text-primary mb-3" />
              <h3>Ready for the first lesson.</h3>
              <p>The team is preparing this course.</p>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="feature-heading">
            <div>
              <span className="eyebrow">LESS WATCHING. MORE DOING.</span>
              <h2>Learn it. Try it. Keep going.</h2>
              <p>Your lessons, videos and resources. Your progress, saved.</p>
            </div>
            {admin && (
              <Button onClick={() => editCourse({ action: 'course' })}>
                <Plus /> Create course
              </Button>
            )}
          </div>
          {resume && (
            <button
              className="continue-course"
              onClick={() => setSelected(resume.id)}
            >
              <Play />
              <span>
                <small>PICK UP WHERE YOU LEFT OFF</small>
                <strong>{resume.title}</strong>
              </span>
              <span className="ml-auto">{resume.progress}%</span>
              <ArrowUpRight />
            </button>
          )}
          <div className="filters">
            <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
              <TabsList>
                <TabsTrigger value="all">All courses</TabsTrigger>
                <TabsTrigger value="progress">In progress</TabsTrigger>
                <TabsTrigger value="done">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
            <small className="ml-auto text-muted-foreground">
              {library.length} course{library.length === 1 ? '' : 's'}
            </small>
          </div>
          <div className="course-grid">
            {visible.map((c, i) => (
              <button
                className="course-card"
                key={c.id}
                onClick={() => setSelected(c.id)}
              >
                <div className={'course-cover shade-' + (i % 3)}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <BookOpen />
                  <small>
                    {c.level}
                    {!c.published ? ' · DRAFT' : ''}
                  </small>
                </div>
                <div className="course-card-body">
                  <h3>{c.title}</h3>
                  <p>{c.summary}</p>
                  <small>
                    {c.total} lessons · {c.minutes} min
                  </small>
                  <Progress
                    value={c.progress}
                    aria-label={c.title + ' progress'}
                  />
                  <div className="flex justify-between">
                    <small>
                      {c.completed}/{c.total} complete
                    </small>
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!visible.length && (
            <section className="panel panel-pad">
              <h3>
                {search
                  ? 'No courses match that search.'
                  : 'No courses in this view yet.'}
              </h3>
              <p>
                Try All courses, or check back when your next course is
                published.
              </p>
            </section>
          )}
          {admin && (
            <div className="notice mt-6">
              Only uploaded content appears here. Your Skool classroom has not
              been imported. Create a course, add modules, then attach videos or
              resources to each lesson.
            </div>
          )}
        </>
      )}
      <Dialog open={!!edit} onOpenChange={(v) => !v && !busy && setEdit(null)}>
        <DialogContent className="modal">
          <DialogHeader>
            <DialogTitle>
              {edit?.id ? 'Edit' : 'Create'}{' '}
              {edit?.action === 'module' ? 'module' : 'course'}
            </DialogTitle>
            <DialogDescription>
              Keep it short. Give members one clear place to start.
            </DialogDescription>
          </DialogHeader>
          <form className="form" onSubmit={save} key={edit?.id || edit?.action}>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <label className="form-label" htmlFor="course-title">
              Title
              <Input
                name="title"
                id="course-title"
                required
                maxLength={120}
                defaultValue={edit?.title || ''}
              />
            </label>
            {edit?.action === 'course' && (
              <>
                <label className="form-label" htmlFor="course-summary">
                  What will they learn?
                  <Textarea
                    name="summary"
                    id="course-summary"
                    maxLength={600}
                    defaultValue={edit?.summary || ''}
                  />
                </label>
                <label className="form-label" htmlFor="course-level">
                  Level / topic
                  <Input
                    name="level"
                    id="course-level"
                    required
                    maxLength={40}
                    defaultValue={edit?.level || 'Start here'}
                  />
                </label>
              </>
            )}
            <label className="form-label" htmlFor="course-position">
              Order (lowest first)
              <Input
                name="position"
                id="course-position"
                type="number"
                min={0}
                max={999}
                defaultValue={edit?.position || 0}
              />
            </label>
            {edit?.action === 'course' && (
              <label className="check" htmlFor="course-published">
                <Checkbox
                  id="course-published"
                  name="published"
                  value="on"
                  defaultChecked={!!edit?.published}
                />{' '}
                Publish course for members
              </label>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? 'Saving…'
                : 'Save ' + (edit?.action === 'module' ? 'module' : 'course')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
