import { getDependentTasks } from "../change-metadata/get-dependent-tasks";
import { getTaskIndexes } from "../change-metadata/get-task-indexes";
import { changeStartAndEndDescendants } from "../suggestions/change-start-and-end-descendants";
import type {
  AdjustTaskToWorkingDatesParams,
  ChangeAction,
  ChangeMetadata,
  ChildByLevelMap,
  DependentMap,
  OnDateChangeSuggestionType,
  Task,
  TaskMapByLevel,
  TaskOrEmpty,
  TaskToGlobalIndexMap,
} from "../types/public-types";
import { collectParents } from "./collect-parents";
import { getAllDescendants } from "./get-all-descendants";

const collectSuggestedParents = (
  changeAction: ChangeAction,
  tasksMap: TaskMapByLevel
) => {
  switch (changeAction.type) {
    case "add-childs":
      return [
        changeAction.parent,
        ...collectParents(changeAction.parent, tasksMap),
      ];

    case "change":
    case "change_start_and_end":
      return collectParents(changeAction.task, tasksMap);

    case "delete": {
      const resSet = new Set<TaskOrEmpty>();

      changeAction.tasks.forEach(task => {
        const parents = collectParents(task, tasksMap);

        parents.forEach(parentTask => {
          resSet.add(parentTask);
        });
      });

      return [...resSet];
    }

    case "move-before":
      return [
        ...collectParents(changeAction.target, tasksMap),
        ...collectParents(changeAction.taskForMove, tasksMap),
      ];

    case "move-after":
      return [
        ...collectParents(changeAction.target, tasksMap),
        ...collectParents(changeAction.taskForMove, tasksMap),
      ];

    case "move-inside": {
      const resSet = new Set<TaskOrEmpty>([changeAction.parent]);

      collectParents(changeAction.parent, tasksMap).forEach(parentTask => {
        resSet.add(parentTask);
      });

      changeAction.childs.forEach(child => {
        collectParents(child, tasksMap).forEach(parentTask => {
          resSet.add(parentTask);
        });
      });

      return [...resSet];
    }

    default:
      throw new Error(
        `Unknown change action: ${(changeAction as ChangeAction).type}`
      );
  }
};

type GetChangeTaskMetadataParams = {
  adjustTaskToWorkingDates: (params: AdjustTaskToWorkingDatesParams) => Task;
  changeAction: ChangeAction;
  childTasksMap: ChildByLevelMap;
  dependentMap: DependentMap;
  isMoveChildsWithParent: boolean;
  isUpdateDisabledParentsOnChange: boolean;
  mapTaskToGlobalIndex: TaskToGlobalIndexMap;
  tasksMap: TaskMapByLevel;
  getTaskCurrentState?: (task: Task) => Task;
  sortedTasks: TaskOrEmpty[];
};

export const getChangeTaskMetadata = ({
  adjustTaskToWorkingDates,
  changeAction,
  childTasksMap,
  dependentMap,
  isMoveChildsWithParent,
  isUpdateDisabledParentsOnChange,
  mapTaskToGlobalIndex,
  tasksMap,
  getTaskCurrentState,
  sortedTasks,
}: GetChangeTaskMetadataParams): ChangeMetadata => {
  const parentSuggestedTasks = isUpdateDisabledParentsOnChange
    ? collectSuggestedParents(changeAction, tasksMap)
    : [];

  const parentSuggestions = parentSuggestedTasks.map(parentTask =>
    getSuggestedStartEndChangesFromDirectChildren(
      parentTask,
      changeAction,
      tasksMap,
      mapTaskToGlobalIndex
    )
  );

  const descendants =
    isMoveChildsWithParent && changeAction.type === "change_start_and_end"
      ? getAllDescendants(changeAction.task, childTasksMap, false)
      : [];

  const descendantSuggestions =
    changeAction.type === "change_start_and_end"
      ? changeStartAndEndDescendants({
          adjustTaskToWorkingDates,
          changedTask: changeAction.changedTask,
          descendants,
          mapTaskToGlobalIndex,
          originalTask: changeAction.originalTask,
        })
      : [];

  const suggestedTasks = [...parentSuggestedTasks, ...descendants];
  const suggestions = [...parentSuggestions, ...descendantSuggestions];

  sortedTasks.map(task => {
    const suggestedTask = getTaskCurrentState(task as Task);

    if (task.start != suggestedTask.start || task.end != suggestedTask.end) {
      const indexesByLevel = mapTaskToGlobalIndex.get(
        task.comparisonLevel ? task.comparisonLevel - 1 : 1
      );
      const indexInMap = indexesByLevel ? indexesByLevel.get(task.id) : -1;
      const existsIndex = suggestedTasks.findIndex(
        sugTask => sugTask.id === task.id
      );
      if (existsIndex !== -1) {
        suggestedTasks[existsIndex] = {
          ...suggestedTasks[existsIndex],
          ...suggestedTask,
        };
        const foundSuggestionIndex = suggestions.findIndex(
          sugTask => sugTask[2].id === task.id
        );

        suggestions[foundSuggestionIndex] = [
          suggestedTask.start,
          suggestedTask.end,
          suggestedTask,
          indexInMap,
        ];
      } else {
        suggestedTasks.push(suggestedTask);
        suggestions.push([
          suggestedTask.start,
          suggestedTask.end,
          suggestedTask,
          indexInMap,
        ]);
      }
    }
  });

  const taskIndexes = getTaskIndexes(changeAction, mapTaskToGlobalIndex);
  const dependentTasks = getDependentTasks(changeAction, dependentMap);

  return [dependentTasks, taskIndexes, suggestedTasks, suggestions];
};

const getSuggestedStartEndChangesFromDirectChildren = (
  parentTask: TaskOrEmpty,
  changeAction: ChangeAction,
  tasksMap: TaskMapByLevel,
  mapTaskToGlobalIndex: TaskToGlobalIndexMap
): OnDateChangeSuggestionType => {
  const { id, comparisonLevel = 1 } = parentTask;
  let start = parentTask.start;
  let end = parentTask.end;

  const indexesByLevel = mapTaskToGlobalIndex.get(comparisonLevel);
  const index = indexesByLevel ? indexesByLevel.get(id) : -1;

  const resIndex = typeof index === "number" ? index : -1;

  const id2Task: Map<string, TaskOrEmpty> = tasksMap.get(comparisonLevel);
  const tasks = Array.from(id2Task.values()).filter(
    ({ type, start, end }) => type !== "empty" && start && end
  ) as Task[];
  const directChildren = tasks
    .filter(task => {
      // as the task is deleted, it must be ignored in the parent start end
      if (
        changeAction.type == "delete" &&
        changeAction.tasks.map(t => t.id).includes(task.id)
      )
        return false;
      return task.parent && parentTask.id == task.parent;
    })
    .map(child => {
      const type = changeAction.type;
      // replace the current child by its changes version
      if (type == "change" || type == "change_start_and_end") {
        if (child.id === changeAction.task.id) {
          if (changeAction.task.type !== "empty") {
            return changeAction.task;
          }
        }
      }
      return child;
    });

  if (directChildren.length > 0) {
    start = directChildren[0].start;
    end = directChildren[0].end;
  }
  directChildren.forEach(task => {
    if (task.parent && parentTask.id == task.parent) {
      const type = changeAction.type;
      if (type != "delete") {
        if (task.start.getTime() < start.getTime()) {
          start = task.start;
        }
        if (task.end.getTime() > end.getTime()) {
          end = task.end;
        }
      }
    }
  });

  return [start, end, parentTask, resIndex];
};
