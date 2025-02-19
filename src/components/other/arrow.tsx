import React, { memo, useCallback, useMemo } from "react";

import {
  ColorStyles,
  Distances,
  DateExtremity,
  Task,
} from "../../types/public-types";
import { generateTrianglePoints } from "../../helpers/generate-triangle-points";
import {
  FixDependencyPosition,
  fixPositionContainerClass,
} from "./fix-dependency-position";

import styles from "./arrow.module.css";

type ArrowProps = {
  colorStyles: ColorStyles;
  distances: Distances;
  taskFrom: Task;
  extremityFrom: DateExtremity;
  fromX1: number;
  fromX2: number;
  fromY: number;
  taskTo: Task;
  extremityTo: DateExtremity;
  toX1: number;
  toX2: number;
  toY: number;
  marginBetweenTasks?: number | null;
  fullRowHeight: number;
  taskHeight: number;
  isShowDependencyWarnings: boolean;
  isCritical: boolean;
  rtl: boolean;
  onArrowDoubleClick?: (taskFrom: Task, taskTo: Task) => void;
  onArrowClick?: (
    taskFrom: Task,
    extremityFrom: DateExtremity,
    taskTo: Task,
    extremityTo: DateExtremity,
    event: React.MouseEvent<SVGElement>
  ) => void;
  handleFixDependency: (task: Task, delta: number) => void;
};

const ArrowInner: React.FC<ArrowProps> = ({
  colorStyles: { arrowColor, arrowWarningColor, arrowCriticalColor },

  distances: {
    arrowIndent,
    dependencyFixWidth,
    dependencyFixHeight,
    dependencyFixIndent,
  },

  taskFrom,
  extremityFrom,
  fromX1,
  fromX2,
  fromY,
  taskTo,
  extremityTo,
  toX1,
  toX2,
  toY,
  marginBetweenTasks = undefined,
  fullRowHeight,
  taskHeight,
  isShowDependencyWarnings,
  isCritical,
  rtl,
  onArrowDoubleClick = undefined,
  onArrowClick = undefined,
  handleFixDependency,
}) => {
  const indexFrom = useMemo(
    () => Math.floor(fromY / fullRowHeight),
    [fromY, fullRowHeight]
  );
  const indexTo = useMemo(
    () => Math.floor(toY / fullRowHeight),
    [toY, fullRowHeight]
  );

  const onDoubleClick = useCallback(() => {
    if (onArrowDoubleClick) {
      onArrowDoubleClick(taskFrom, taskTo);
    }
  }, [taskFrom, taskTo, onArrowDoubleClick]);

  const onClick = useCallback(
    (event: React.MouseEvent<SVGElement>) => {
      if (onArrowClick) {
        onArrowClick(taskFrom, extremityFrom, taskTo, extremityTo, event);
      }
    },
    [taskFrom, taskTo, onArrowClick]
  );

  const [path, trianglePoints] = useMemo(
    () =>
      drownPathAndTriangle(
        indexFrom,
        fromX1,
        fromX2,
        fromY,
        (extremityFrom === "startOfTask") !== rtl,
        indexTo,
        toX1,
        toX2,
        toY,
        (extremityTo === "startOfTask") !== rtl,
        fullRowHeight,
        taskHeight,
        arrowIndent
      ),
    [
      indexFrom,
      fromX1,
      fromX2,
      fromY,
      extremityFrom,
      indexTo,
      toX1,
      toX2,
      toY,
      extremityTo,
      rtl,
      fullRowHeight,
      taskHeight,
      arrowIndent,
    ]
  );

  const taskFromFixerPosition = useMemo(() => {
    const isLeft = (extremityFrom === "startOfTask") !== rtl;

    if (isLeft) {
      return fromX1 - dependencyFixIndent;
    }

    return fromX2 + dependencyFixIndent;
  }, [fromX1, fromX2, extremityFrom, rtl, dependencyFixIndent]);

  const taskToFixerPosition = useMemo(() => {
    const isLeft = (extremityTo === "startOfTask") !== rtl;

    if (isLeft) {
      return toX1 - dependencyFixIndent;
    }

    return toX2 + dependencyFixIndent;
  }, [toX1, toX2, extremityTo, rtl, dependencyFixIndent]);

  const fixDependencyTaskFrom = useCallback(() => {
    if (typeof marginBetweenTasks !== "number") {
      return;
    }

    handleFixDependency(taskFrom, marginBetweenTasks);
  }, [taskFrom, handleFixDependency, marginBetweenTasks]);

  const fixDependencyTaskTo = useCallback(() => {
    if (typeof marginBetweenTasks !== "number") {
      return;
    }

    handleFixDependency(taskTo, -marginBetweenTasks);
  }, [taskTo, handleFixDependency, marginBetweenTasks]);

  const hasWarning = useMemo(
    () =>
      isShowDependencyWarnings &&
      typeof marginBetweenTasks === "number" &&
      marginBetweenTasks < 0,
    [marginBetweenTasks, isShowDependencyWarnings]
  );

  const color = useMemo(() => {
    if (isCritical) {
      return arrowCriticalColor;
    }

    if (hasWarning) {
      return arrowWarningColor;
    }

    return arrowColor;
  }, [
    hasWarning,
    isCritical,
    arrowColor,
    arrowCriticalColor,
    arrowWarningColor,
  ]);

  return (
    <g className={fixPositionContainerClass} fill={color} stroke={color}>
      <g
        data-testid={`task-arrow-${extremityFrom}-${taskFrom.name}-${extremityTo}-${taskTo.name}`}
        className={`"arrow" ${styles.arrow_clickable}`}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
      >
        {onArrowDoubleClick && <path d={path} className={styles.clickZone} />}

        <path className={styles.mainPath} d={path} />

        <polygon points={trianglePoints} />
      </g>

      {hasWarning && (
        <>
          <FixDependencyPosition
            x={taskToFixerPosition}
            y={toY}
            dependencyFixIndent={dependencyFixIndent}
            isLeft={rtl}
            color="grey"
            width={dependencyFixWidth}
            height={dependencyFixHeight}
            handleFixPosition={fixDependencyTaskTo}
          />

          <FixDependencyPosition
            x={taskFromFixerPosition}
            y={fromY}
            dependencyFixIndent={dependencyFixIndent}
            isLeft={!rtl}
            color="grey"
            width={dependencyFixWidth}
            height={dependencyFixHeight}
            handleFixPosition={fixDependencyTaskFrom}
          />
        </>
      )}
    </g>
  );
};

export const Arrow = memo(ArrowInner);

const drownPathAndTriangle = (
  indexForm: number,
  fromX1: number,
  fromX2: number,
  fromY: number,
  isTaskFromLeftSide: boolean,
  indexTo: number,
  toX1: number,
  toX2: number,
  toY: number,
  isTaskToLeftSide: boolean,
  fullRowHeight: number,
  taskHeight: number,
  arrowIndent: number
) => {
  const isDownDirected = indexTo > indexForm;
  const horizontalDockingY = isDownDirected
    ? (indexForm + 1) * fullRowHeight
    : indexForm * fullRowHeight;

  const taskFromEndPositionX = isTaskFromLeftSide
    ? fromX1 - arrowIndent
    : fromX2 + arrowIndent;

  const taskToEndPositionX = isTaskToLeftSide
    ? toX1 - arrowIndent
    : toX2 + arrowIndent;
  const taskToEndPositionY = toY + taskHeight / 2;

  const path = `M ${isTaskFromLeftSide ? fromX1 : fromX2} ${
    fromY + taskHeight / 2
  }
  H ${taskFromEndPositionX}
  V ${horizontalDockingY}
  H ${taskToEndPositionX}
  V ${taskToEndPositionY}
  H ${isTaskToLeftSide ? toX1 : toX2}`;

  const trianglePoints = isTaskToLeftSide
    ? generateTrianglePoints(toX1, taskToEndPositionY, 5, false)
    : generateTrianglePoints(toX2, taskToEndPositionY, 5, true);

  return [path, trianglePoints];
};
