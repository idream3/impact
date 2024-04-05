import { useEffect, useState } from "react";
import { cleanup, getActiveStoreContainer } from "./store";

// @ts-ignore
Symbol.dispose ??= Symbol("Symbol.dispose");

// Use for memory leak debugging
// const registry = new FinalizationRegistry((message) => console.log(message));

export type ObserverContextType = "component" | "derived" | "effect";

export const signalDebugHooks: {
  onGetValue?: (context: ObserverContext, signal: SignalTracker) => void;
  onSetValue?: (
    signal: SignalTracker,
    value: unknown,
    derived?: boolean,
  ) => void;
  onEffectRun?: (effect: () => void) => void;
} = {};

// let lastId = 0;

export class ObserverContext {
  static version = 0;
  static stack: ObserverContext[] = [];
  static get current(): ObserverContext | undefined {
    return ObserverContext.stack[ObserverContext.stack.length - 1];
  }
  private _getters = new Set<SignalTracker>();
  private _setters = new Set<SignalTracker>();

  public stack = "";
  // id = lastId++;
  constructor(
    public type: "component" | "derived" | "effect",
    private _onUpdate: (version: number) => void,
  ) {
    ObserverContext.stack.push(this);

    if (signalDebugHooks.onGetValue) {
      this.stack = new Error().stack || "";
    }
    // Use for memory leak debugging
    // registry.register(this, this.id + " has been collected");
  }
  registerGetter(signal: SignalTracker) {
    // We do not allow having getters when setting a signal, the reason is to ensure
    // no infinite loops
    if (this._setters.has(signal)) {
      return;
    }

    this._getters.add(signal);
  }
  registerSetter(signal: SignalTracker) {
    // We do not allow having getters when setting a signal, the reason is to ensure
    // no infinite loops
    if (this._getters.has(signal)) {
      this._getters.delete(signal);
    }

    this._setters.add(signal);
  }
  /**
   * There is only a single subscriber to any ObserverContext
   */
  private subscribe() {
    this._getters.forEach((signal) => {
      signal.addContext(this);
    });

    return () => {
      this._getters.forEach((signal) => {
        signal.removeContext(this);
      });
    };
  }
  notify() {
    this._onUpdate(ObserverContext.version++);
  }
  [Symbol.dispose]() {
    ObserverContext.stack.pop();
    return this.subscribe();
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
    // A context can be synchronously added back to this signal related to firing the signal, which
    // could cause a loop. We only want to notify the current contexts
    const contexts = Array.from(this.contexts);
    contexts.forEach((context) => context.notify());
  }
}

export type Signal<T> = {
  get value(): T extends Promise<infer V> ? ObservablePromise<V> : T;
  set value(value: T);
};

// We resolving contexts with an active ObserverContext, where we do not
// want to track any signals accessed
function isResolvingContextFromComponent(context: ObserverContext) {
  return context.type === "component" && getActiveStoreContainer();
}

export function signal<T>(initialValue: T) {
  let currentAbortController: AbortController | undefined;

  let value =
    initialValue && initialValue instanceof Promise
      ? createPromise(initialValue)
      : initialValue;

  const signal = new SignalTracker(() => value);

  function createPromise(promise: Promise<any>): ObservablePromise<T> {
    currentAbortController?.abort();

    const abortController = (currentAbortController = new AbortController());

    return createPendingPromise(
      promise
        .then(function (resolvedValue) {
          if (abortController.signal.aborted) {
            return;
          }

          value = createFulfilledPromise(
            Promise.resolve(resolvedValue),
            resolvedValue,
          );

          signal.notify();

          return resolvedValue;
        })
        .catch((rejectedReason) => {
          if (abortController.signal.aborted) {
            return;
          }

          const rejectedPromise = Promise.reject(rejectedReason);

          value = createRejectedPromise(rejectedPromise, rejectedReason);

          signal.notify();

          return rejectedPromise;
        }),
    );
  }

  return {
    get value() {
      if (
        ObserverContext.current &&
        !isResolvingContextFromComponent(ObserverContext.current)
      ) {
        ObserverContext.current.registerGetter(signal);
        if (signalDebugHooks.onGetValue) {
          signalDebugHooks.onGetValue(ObserverContext.current, signal);
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

      if (newValue instanceof Promise) {
        newValue = createPromise(newValue);
      }

      const prevValue = value;

      value = newValue;

      if (signalDebugHooks.onSetValue) {
        signalDebugHooks.onSetValue(signal, value);
        ObserverContext.current?.registerSetter(signal);
      }

      if (value === prevValue) {
        return;
      }

      if (value instanceof Promise) {
        // We might set a Promise.resolve, in which case we do not want to notify as the micro task has
        // already done it in "createPromise". So we run our own micro task to check if the promise
        // is still pending, where we do want to notify
        Promise.resolve().then(() => {
          if (value instanceof Promise && value.status === "pending") {
            signal.notify();
          }
        });
      } else {
        signal.notify();
      }
    },
  } as Signal<T>;
}

type PendingPromise<T> = Promise<T> & {
  status: "pending";
};

type FulfilledPromise<T> = Promise<T> & {
  status: "fulfilled";
  value: T;
};

type RejectedPromise<T> = Promise<T> & {
  status: "rejected";
  reason: unknown;
};

export type ObservablePromise<T> =
  | PendingPromise<T>
  | FulfilledPromise<T>
  | RejectedPromise<T>;

function createPendingPromise<T>(promise: Promise<T>): PendingPromise<T> {
  return Object.assign(promise, {
    status: "pending" as const,
  });
}

function createFulfilledPromise<T>(
  promise: Promise<T>,
  value: T,
): FulfilledPromise<T> {
  return Object.assign(promise, {
    status: "fulfilled" as const,
    value,
  });
}

function createRejectedPromise<T>(
  promise: Promise<T>,
  reason: unknown,
): RejectedPromise<T> {
  return Object.assign(promise, {
    status: "rejected" as const,
    reason,
  });
}

export function use<T>(promise: ObservablePromise<T>): T {
  if (promise.status === "pending") {
    throw promise;
  }

  if (promise.status === "rejected") {
    throw promise.reason;
  }

  return promise.value;
}

export function derived<T>(cb: () => T) {
  let value: T;
  let disposer: () => void;
  let isDirty = true;
  const signal = new SignalTracker(() => value);

  return {
    get value() {
      if (
        ObserverContext.current &&
        !isResolvingContextFromComponent(ObserverContext.current)
      ) {
        ObserverContext.current.registerGetter(signal);
        if (signalDebugHooks.onGetValue) {
          signalDebugHooks.onGetValue(ObserverContext.current, signal);
        }
      }

      if (isDirty) {
        disposer?.();

        const context = new ObserverContext("derived", () => {
          isDirty = true;

          signal.notify();
        });

        value = cb();

        // @ts-ignore
        disposer = context[Symbol.dispose]();

        isDirty = false;

        if (signalDebugHooks.onSetValue) {
          signalDebugHooks.onSetValue(signal, value, true);
        }
      }

      return value;
    },
  };
}

export function effect(cb: () => void) {
  let currentSubscriptionDisposer: () => void;

  const updater = () => {
    const context = new ObserverContext("effect", () => {
      currentSubscriptionDisposer();
      currentSubscriptionDisposer = updater();
    });

    cb();

    if (signalDebugHooks.onEffectRun) {
      signalDebugHooks.onEffectRun(cb);
    }

    return context[Symbol.dispose]();
  };

  currentSubscriptionDisposer = updater();

  return cleanup(currentSubscriptionDisposer);
}

export function observer() {
  const [_, setState] = useState<unknown>();

  return new ObserverContext("component", setState);
}
