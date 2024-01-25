import { Fragment, h, render } from "preact";
import * as styles from "./styles";
import * as icons from "./icons";
import { useEffect, useState } from "preact/hooks";
import ValueInspector from "./ValueInspector";

const root = document.createElement("div");

root.style.position = "fixed";
root.style.zIndex = "99999999999999999999";
root.style.top = "0px";
root.style.right = "0px";

type CodeLocation = {
  name: string;
  path: string;
};

type ObserverType = "component" | "effect" | "derived";

type Observer = CodeLocation & {
  type: ObserverType;
};

type DebugData =
  | {
      id: number;
      type: "signal";
      source: CodeLocation;
      target: CodeLocation;
      observers: Observer[];
      value: any;
    }
  | {
      id: number;
      type: "derived";
      source: CodeLocation;
      target: CodeLocation;
      observers: Observer[];
      value: any;
    }
  | { id: number; type: "effect"; name: string; target: CodeLocation };

let currentDebugData: DebugData[] = [];

let currentSubscriber: undefined | ((data: DebugData[]) => void);

export function addDebugData(data: DebugData) {
  currentDebugData = [...currentDebugData, data].sort((a, b) => a.id - b.id);
  currentSubscriber?.(currentDebugData);
}

function resetDebugData() {
  currentDebugData = [];
  currentSubscriber?.(currentDebugData);
}

function useWorkspacePath() {
  const [workspacePath, setWorkspacePath] = useState(
    localStorage.getItem("impact.debugger.workspacePath") || "",
  );

  useEffect(() => {
    if (workspacePath) {
      localStorage.setItem("impact.debugger.workspacePath", workspacePath);
    }
  }, [workspacePath]);

  return [workspacePath, setWorkspacePath] as const;
}

// @ts-ignore
const csbFocusFile = window.CODESANDBOX_PREVIEW?.focusFile;

function Item({
  data,
  workspacePath,
}: {
  data: DebugData;
  workspacePath: string;
}) {
  const [open, setOpen] = useState(false);

  const renderTitle = () => {
    let title: string;
    const fileName = data.target.path.split("/").pop()!.split(".")[0]!;

    if (data.type === "derived") {
      title = `${fileName}.${data.target.name}`;
    } else if (data.type === "effect") {
      title = `${fileName}.${data.name}`;
    } else {
      title = `${fileName}.${data.target.name}`;
    }

    const [relativePath, line] = data.target.path.split(":");

    return (
      <span style={{ display: "flex", gap: ".6em", minWidth: 0 }}>
        <span>
          <span style={styles.colors[12]}>{title}</span>
          <span style={styles.colors[10]}>();</span>{" "}
        </span>

        <span style={styles.colors[7]}>{`//`}</span>
        <span
          dir="rtl"
          onClick={
            csbFocusFile
              ? () => {
                  csbFocusFile(
                    "/" + workspacePath + relativePath,
                    Number(line),
                  );
                }
              : undefined
          }
          style={styles.path}
        >
          {relativePath.startsWith("/") ? relativePath.slice(1) : relativePath}
        </span>
      </span>
    );
  };

  const renderLine = () => {
    return (
      <span
        style={{
          ...styles.list.headerLine,
          background:
            data.type === "signal"
              ? "#00F0FF"
              : data.type === "derived"
              ? "#00ff66"
              : "#ff00ff",
        }}
      />
    );
  };

  return (
    <Fragment>
      <span style={styles.list.header}>
        <span style={styles.list.headerText}>
          {renderLine()}
          {renderTitle()}
        </span>
        <span
          onClick={() => setOpen(!open)}
          style={{
            cursor: "pointer",
            color: styles.palette[11],
            rotate: open ? "0deg" : "180deg",
            padding: ".5em",
          }}
        >
          {icons.chevron}
        </span>
      </span>

      <div style={{ position: "relative", display: open ? "block" : "none" }}>
        {data.type === "effect" ? (
          <Fragment>
            <span style={styles.list.contentLine} />

            <span style={styles.list.contentItem}>
              {icons.lightingBolt}
              <span style={styles.colors[11]}>{data.name}</span>
            </span>
          </Fragment>
        ) : (
          <Fragment>
            <span style={styles.list.contentLine} />

            <span style={styles.list.contentItem}>
              {icons.pencil}
              <span style={styles.colors[11]}>
                <ValueInspector value={data.value} delimiter="." />
              </span>
              <span style={styles.path}>{`// ` + typeof data.value}</span>
            </span>

            {data.source && (
              <span style={styles.list.contentItem}>
                {icons.lightingBolt}
                <span style={styles.colors[11]}>{data.source.name}</span>
                <span
                  style={styles.path}
                  title={data.source.path}
                  onClick={
                    csbFocusFile
                      ? () => {
                          const [relativePath, line] =
                            data.source.path.split(":");
                          csbFocusFile(
                            "/" + workspacePath + relativePath,
                            Number(line),
                          );
                        }
                      : undefined
                  }
                >
                  {`// ` +
                    (data.source.path.startsWith("/")
                      ? data.source.path.slice(1)
                      : data.source.path)}
                </span>
              </span>
            )}

            {data.observers && data.observers.length > 0 && (
              <>
                {data.observers.map(({ name, path }, index) => (
                  <span style={styles.list.contentItem} key={index}>
                    {icons.eye}
                    <span style={styles.colors[11]}>{name}</span>
                    <span
                      style={styles.path}
                      title={path}
                      onClick={
                        csbFocusFile
                          ? () => {
                              const [relativePath, line] = path.split(":");
                              csbFocusFile(
                                "/" + workspacePath + relativePath,
                                Number(line),
                              );
                            }
                          : undefined
                      }
                    >
                      {" "}
                      {`// ` + (path.startsWith("/") ? path.slice(1) : path)}
                    </span>
                  </span>
                ))}
              </>
            )}
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

function App() {
  const [debugData, setDebugData] = useState<DebugData[]>(currentDebugData);
  const [workspacePath, setWorkspacePath] = useWorkspacePath();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    currentSubscriber = setDebugData;
  }, []);

  if (!opened) {
    return (
      <div style={styles.impactButton} onClick={() => setOpened(true)}>
        {icons.dev}
      </div>
    );
  }

  console.log(debugData);

  return (
    <>
      <div style={{ ...styles.impactButton, left: 300 }}>{icons.dev}</div>

      <div style={styles.impactBoundary}>
        <div style={styles.body}>
          {/* Header */}
          <div style={styles.header}>
            <span style={styles.colors[12]}>
              Impact <span style={styles.colors[11]}>debugger</span>
              <span style={styles.colors[10]}>;</span>
            </span>

            <div style={styles.workspaceInputWrapper}>
              <span style={styles.colors[7]}>//</span>
              <input
                style={styles.workspace}
                type="text"
                placeholder="Base path..."
                value={workspacePath}
                // @ts-ignore
                onChange={(event) => setWorkspacePath(event.target.value)}
              />
            </div>

            <span
              style={{ cursor: "pointer", color: styles.palette[11] }}
              onClick={resetDebugData}
            >
              {icons.clean}
            </span>

            <span
              style={{ cursor: "pointer", color: styles.palette[11] }}
              onClick={() => setOpened(false)}
            >
              {icons.cross}
            </span>
          </div>

          {/* List */}
          <div style={styles.list.container}>
            {/* Start timeline */}
            <div style={styles.list.startTimeline}>
              <span
                style={{
                  ...styles.list.startTimelineItem,
                  background: styles.palette[6],
                }}
              />
              <span
                style={{
                  ...styles.list.startTimelineItem,
                  background: styles.palette[7],
                }}
              />
              <span
                style={{
                  ...styles.list.startTimelineItem,
                  background: styles.palette[8],
                }}
              />
            </div>

            {debugData.reverse().map((data) => (
              <Item key={data.id} data={data} workspacePath={workspacePath} />
            ))}

            {/* End timeline */}
            <div style={styles.list.startTimeline}>
              <span
                style={{
                  ...styles.list.startTimelineItem,
                  background: styles.palette[8],
                }}
              />
              <span
                style={{
                  ...styles.list.startTimelineItem,
                  background: styles.palette[7],
                }}
              />
              <span
                style={{
                  ...styles.list.startTimelineItem,
                  background: styles.palette[6],
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

render(<App />, root);

export function mount() {
  document.body.appendChild(root);
}

export function unmount() {
  document.body.removeChild(root);
}
