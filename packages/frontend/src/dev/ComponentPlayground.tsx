import { Button, Card, CardBody, CardTitle, Input } from "../components/ui";

export default function ComponentPlayground() {
  return (
    <main className="min-h-screen bg-surface-canvas p-6 text-ink-950">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Component Playground</h1>
          <p className="text-sm text-ink-800">
            Isolated preview for foundational raw-Tailwind UI components.
          </p>
        </header>

        <Card>
          <CardTitle>Buttons</CardTitle>
          <CardBody className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
          </CardBody>
        </Card>

        <Card>
          <CardTitle>Inputs</CardTitle>
          <CardBody className="space-y-2">
            <Input placeholder="Lesson title" />
            <Input placeholder="Class reference (e.g. 3B)" />
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
