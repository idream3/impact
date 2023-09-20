import { useSyncExternalStore } from "react";
import { createObserveDebugEntry, createSetterDebugEntry } from "./debugger";
import { produce } from "immer";

// @ts-ignore
Symbol.dispose ??= Symbol("Symbol.dispose");

export class ObserverContext {
  static stack: ObserverContext[] = [];
  static get current() {
    return ObserverContext.stack[ObserverContext.stack.length - 1];
  }
  private _signals = new Set<SignalTracker>();
  private _onUpdate?: () => void;
  private _snapshot: { signals: unknown[] } = {
    signals: [],
  };
  get snapshot() {
    return this._snapshot;
  }
  constructor() {
    ObserverContext.stack.push(this);
  }
  registerSignal(signal: SignalTracker) {
    this._signals.add(signal);

    this._snapshot.signals.push(signal.getValue());
  }
  /**
   * There is only a single subscriber to any ObserverContext
   */
  subscribe(onUpdate: () => void) {
    this._onUpdate = onUpdate;
    this._signals.forEach((signal) => {
      signal.addContext(this);
    });

    return () => {
      this._signals.forEach((signal) => {
        signal.removeContext(this);
      });
    };
  }
  notify() {
    this._snapshot = {
      ...this._snapshot,
    };
    this._onUpdate?.();
  }
  [Symbol.dispose]() {
    ObserverContext.stack.pop();
  }
}

export class SignalTracker {
  private contexts = new Set<ObserverContext>();
  constructor(public getValue: () => unknown) {}
  addContext(context: ObserverContext) {
    this.contexts.add(context);
  }
  removeContext(context: ObserverContext) {
    this.contexts.delete(context);
  }
  notify() {
    this.contexts.forEach((context) => context.notify());
  }
}

export type Signal<T> = {
  onChange(listener: (newValue: T, prevValue: T) => void): () => void;
  get value(): T;
  set value(newValue: T | ((draft: T) => T | void));
};

export function signal<T>(value: T): Signal<T> {
  const signal = new SignalTracker(() => value);
  let listeners: Set<(newValue: T, prevValue: T) => void> | undefined;

  return {
    onChange(listener) {
      listeners = listeners || new Set();

      listeners.add(listener);

      return () => {
        listeners?.delete(listener);
      };
    },
    get value() {
      if (ObserverContext.current) {
        ObserverContext.current.registerSignal(signal);
        if (process.env.NODE_ENV === "development") {
          createObserveDebugEntry(signal);
        }
      }

      return value;
    },
    set value(newValue) {
      if (value === newValue) {
        if (
          process.env.NODE_ENV === "development" &&
          typeof newValue === "object" &&
          newValue !== null
        ) {
          console.warn(
            "You are setting the same object in a signal, which will not trigger observers. Did you mutate it?",
            newValue,
          );
        }

        return;
      }

      const prevValue = value;

      value =
        typeof newValue === "function"
          ? produce(value, newValue as (draft: T) => T | void)
          : newValue;

      if (process.env.NODE_ENV === "development") {
        createSetterDebugEntry(signal, value);
      }

      signal.notify();

      listeners?.forEach((listener) => listener(value, prevValue));
    },
  };
}

export function derive<T>(cb: () => T) {
  let value: T;
  let disposer: () => void;
  let isDirty = true;
  const signal = new SignalTracker(() => value);
  let listeners: Set<(newValue: T, prevValue: T) => void> | undefined;

  return {
    onChange: (listener: (newValue: T, prevValue: T) => void) => {
      listeners = listeners || new Set();

      listeners.add(listener);

      return () => {
        listeners?.delete(listener);
      };
    },
    get value() {
      if (ObserverContext.current) {
        ObserverContext.current.registerSignal(signal);
        if (process.env.NODE_ENV === "development") {
          createObserveDebugEntry(signal);
        }
      }

      if (isDirty) {
        disposer?.();

        const context = new ObserverContext();

        value = cb();

        // @ts-ignore
        context[Symbol.dispose]();

        disposer = context.subscribe(() => {
          isDirty = true;

          const prevValue = value;

          if (listeners?.size) {
            isDirty = false;
            value = cb();
          }

          signal.notify();

          listeners?.forEach((listener) => listener(value, prevValue));
        });

        isDirty = false;

        if (process.env.NODE_ENV === "development") {
          createSetterDebugEntry(signal, value, true);
        }
      }

      return value;
    },
  };
}

export function observe(): ObserverContext;
export function observe<T extends (...args: any[]) => any>(cb: T): T;
export function observe(cb?: any) {
  if (cb) {
    return (...args: any[]) => {
      const context = new ObserverContext();

      useSyncExternalStore(
        (update) => context.subscribe(update),
        () => context.snapshot,
        () => context.snapshot,
      );

      try {
        const result = cb(...args);
        context[Symbol.dispose]();

        return result;
      } catch (error) {
        context[Symbol.dispose]();

        throw error;
      }
    };
  }

  const context = new ObserverContext();

  useSyncExternalStore(
    (update) => context.subscribe(update),
    () => context.snapshot,
    () => context.snapshot,
  );

  return context;
}
