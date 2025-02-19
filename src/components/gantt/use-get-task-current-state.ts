import { useCallback } from "react";

import addMilliseconds from "date-fns/addMilliseconds";
import maxDate from "date-fns/max";
import minDate from "date-fns/min";

import { checkIsDescendant } from "../../helpers/check-is-descendant";

import type {
  AdjustTaskToWorkingDatesParams,
  BarMoveAction,
  ChangeInProgress,
  DateExtremity,
  GanttDateRounding,
  MapTaskToCoordinates,
  Task,
  TaskMapByLevel,
} from "../../types/public-types";
import { collectParents } from "../../helpers/collect-parents";

type UseGetTaskCurrentStateParams = {
  adjustTaskToWorkingDates: (params: AdjustTaskToWorkingDatesParams) => Task;
  changeInProgress: ChangeInProgress | null;
  isAdjustToWorkingDates: boolean;
  isMoveChildsWithParent: boolean;
  isUpdateDisabledParentsOnChange: boolean;
  mapTaskToCoordinates: MapTaskToCoordinates;
  roundDate: (
    date: Date,
    action: BarMoveAction,
    dateExtremity: DateExtremity
  ) => Date;
  tasksMap: TaskMapByLevel;
  dateMoveStep: GanttDateRounding;
};

export const useGetTaskCurrentState = ({
  adjustTaskToWorkingDates,
  changeInProgress,
  isAdjustToWorkingDates,
  isMoveChildsWithParent,
  isUpdateDisabledParentsOnChange,
  mapTaskToCoordinates,
  roundDate,
  tasksMap,
}: UseGetTaskCurrentStateParams) => {
  const getTaskCurrentState = useCallback(
    (currentOriginalTask: Task): Task => {
      // ----------------------------------------------------------
      // The aim of getTaskCurrentState is to return the task to display in real time
      //  + currentOriginalTask is the task as it was before beginning to change it
      //  + changeInProgress.changedTask is the task that corresponds to the exact move on the full task or the start/end date handlers
      //  + the task is then rounded
      //  + and then adjusted to working days if required
      if (changeInProgress) {
        // ------------------------------------------------------------------------------
        // the aim of this part is to manage the being moved task
        // It rounds the date and then adjusts it to working dates

        if (changeInProgress.originalTask === currentOriginalTask) {
          const task = changeInProgress.changedTask;
          if (isAdjustToWorkingDates) {
            return adjustTaskToWorkingDates({
              action: changeInProgress.action,
              changedTask: task,
              originalTask: currentOriginalTask,
              roundDate,
            });
          }

          return task;
        }

        //move depended tasks
        if (currentOriginalTask.dependencies?.length) {
          const taskMapByLevel = tasksMap.get(
            currentOriginalTask.comparisonLevel || 1
          );
          for (const dep of currentOriginalTask.dependencies) {
            const depSourceTask = taskMapByLevel.get(dep.sourceId);
            if (depSourceTask && depSourceTask.start && depSourceTask.end) {
              const currentState = getTaskCurrentState(depSourceTask as Task);
              const startTsDiff =
                currentState.start.getTime() - depSourceTask.start.getTime();
              const endTsDiff =
                currentState.end.getTime() - depSourceTask.end.getTime();

              if (startTsDiff || endTsDiff) {
                const tsDiff =
                  dep.sourceTarget === "endOfTask" ? endTsDiff : startTsDiff;
                const movedTask: Task = {
                  ...currentOriginalTask,
                  end: addMilliseconds(currentOriginalTask.end, tsDiff),
                  start: addMilliseconds(currentOriginalTask.start, tsDiff),
                };

                if (isAdjustToWorkingDates) {
                  return adjustTaskToWorkingDates({
                    action: changeInProgress.action,
                    changedTask: movedTask,
                    originalTask: currentOriginalTask,
                    roundDate,
                  });
                }
                return movedTask;
              }
            }
          }
        }

        if (
          isMoveChildsWithParent &&
          currentOriginalTask.start &&
          currentOriginalTask.end
        ) {
          const parentsChangeInProgress = collectParents(changeInProgress.originalTask, tasksMap)
          const excludeParentsIds =  parentsChangeInProgress.map(task => task.id)
          const parents = collectParents(currentOriginalTask, tasksMap).filter(
            task => task.start && task.end && !excludeParentsIds.includes(task.id)
          );
          for (const parent of parents) {
            const currentState = getTaskCurrentState(parent as Task);
            const startTsDiff =
              currentState.start.getTime() - parent.start.getTime();
            const endTsDiff = currentState.end.getTime() - parent.end.getTime();

            if (startTsDiff && startTsDiff == endTsDiff) {
              const tsDiff =  startTsDiff;
              const movedTask: Task = {
                ...currentOriginalTask,
                end: addMilliseconds(currentOriginalTask.end, tsDiff),
                start: addMilliseconds(currentOriginalTask.start, tsDiff),
              };

              if (isAdjustToWorkingDates) {
                return adjustTaskToWorkingDates({
                  action: changeInProgress.action,
                  changedTask: movedTask,
                  originalTask: currentOriginalTask,
                  roundDate,
                });
              }
              return movedTask;
            }
          }
        }

        // ------------------------------------------------------------------------------
        // the aim of this part is to update child of the being moved task
        if (
          isMoveChildsWithParent &&
          changeInProgress.action === "move" &&
          checkIsDescendant(
            changeInProgress.originalTask,
            currentOriginalTask,
            tasksMap
          ) &&
          currentOriginalTask.start &&
          currentOriginalTask.end
        ) {
          const { tsDiff } = changeInProgress;

          const movedTask: Task = {
            ...currentOriginalTask,
            end: addMilliseconds(currentOriginalTask.end, tsDiff),
            start: addMilliseconds(currentOriginalTask.start, tsDiff),
          };

          if (isAdjustToWorkingDates) {
            return adjustTaskToWorkingDates({
              action: changeInProgress.action,
              changedTask: movedTask,
              originalTask: currentOriginalTask,
              roundDate,
            });
          }
          return movedTask;
        }

        // ------------------------------------------------------------------------------
        // the aim of this part is to update parents of the being moved task
        if (
          isUpdateDisabledParentsOnChange &&
          currentOriginalTask.isDisabled &&
          currentOriginalTask.id == changeInProgress.originalTask.parent &&
          checkIsDescendant(
            currentOriginalTask,
            changeInProgress.originalTask,
            tasksMap
          )
        ) {
          // Get all the children of the current Task
          const childrenTasks = Array.from(
            tasksMap.get(currentOriginalTask.comparisonLevel || 1).values()
          )
            .filter(task => {
              return (
                task.parent == currentOriginalTask.id &&
                task.type !== "empty" &&
                task.start &&
                task.end
              );
            })
            .map(task => task as Task);

          const startDates = childrenTasks.map(task => {
            return getTaskCurrentState(task).start;
          });
          const endDates = childrenTasks.map(task => {
            return getTaskCurrentState(task).end;
          });

          return {
            ...currentOriginalTask,
            start: minDate(startDates),
            end: maxDate(endDates),
          };
        }
      }

      const progressIsChanged =
        changeInProgress &&
        changeInProgress.originalTask === currentOriginalTask &&
        changeInProgress.changedTask.progress != currentOriginalTask.progress;
      if (progressIsChanged) {
        return {
          ...currentOriginalTask,
          progress: changeInProgress.changedTask.progress,
        };
      }
      return currentOriginalTask;
    },
    [
      adjustTaskToWorkingDates,
      changeInProgress,
      isAdjustToWorkingDates,
      isMoveChildsWithParent,
      isUpdateDisabledParentsOnChange,
      mapTaskToCoordinates,
      roundDate,
      tasksMap,
    ]
  );

  return getTaskCurrentState;
};
