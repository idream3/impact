import React, { StrictMode, Suspense, memo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createStoreProvider,
  derived,
  effect,
  signal,
  use,
  useStore,
} from "impact-react";

function CounterStore() {
  const count = signal(0);
  const double = derived(() => count() * 2);
  const timeout = signal(new Promise((resolve) => setTimeout(resolve, 5000)));

  effect(() => {
    console.log("count", count());
  });

  return {
    get count() {
      return count();
    },
    get double() {
      return double();
    },
    get timeout() {
      return timeout();
    },
    increase() {
      count((current) => current + 1);
    },
  };
}

const useCounter = () => useStore(CounterStore);
const CounterStoreProvider = createStoreProvider(CounterStore);

const Test2 = memo(function Test2() {
  using counter = useCounter();

  use(counter.timeout);

  return (
    <div>
      <h1>Hi {counter.count}</h1>;
      <button onClick={counter.increase}>Increase</button>;
    </div>
  );
});

export default function App() {
  const [mounted, setMounted] = useState(true);

  return (
    <div>
      {mounted ? (
        <CounterStoreProvider>
          <Suspense fallback={<div>Loading...</div>}>
            <Test2 />
          </Suspense>
        </CounterStoreProvider>
      ) : null}
      <button onClick={() => setMounted(!mounted)}>Mount/Unmount</button>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
