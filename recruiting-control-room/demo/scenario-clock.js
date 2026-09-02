const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value) => (
  typeof value === 'string'
  && ISO_DATE_PATTERN.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
);

export const getDueDateState = ({ dueDate, scenarioAsOfDate, completed = false }) => {
  if (completed) return 'completed';
  if (!isIsoDate(dueDate) || !isIsoDate(scenarioAsOfDate)) return 'undated';
  if (dueDate < scenarioAsOfDate) return 'overdue';
  if (dueDate === scenarioAsOfDate) return 'due-today';
  return 'future';
};

export const isActionOverdue = (action, completedStatus) => getDueDateState({
  dueDate: action.dueDate,
  scenarioAsOfDate: action.scenarioAsOfDate,
  completed: action.status === completedStatus,
}) === 'overdue';

export const formatDueDateState = (state) => ({
  completed: 'Completed locally',
  overdue: 'Overdue',
  'due-today': 'Due today',
  future: 'Future',
  undated: 'Date unavailable',
}[state] || 'Date unavailable');
