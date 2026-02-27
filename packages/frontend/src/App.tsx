import Shell from "./components/layout/Shell";

export default function App() {
  return (
    <Shell>
      <div className="flex h-full items-center justify-center">
        <div className="max-w-lg text-center">
          <h1 className="font-display text-3xl text-ink-900">Teacher Assist</h1>
          <p className="mt-3 text-base text-ink-800">
            Frontend scaffolding is ready. Build the chat interface here.
          </p>
        </div>
      </div>
    </Shell>
  );
}
