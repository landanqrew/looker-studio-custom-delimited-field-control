/**
 * This file provides the mock "data" received
 * by your visualization code when you develop
 * locally.
 */
export const message = {
  tables: {
    DEFAULT: [
      {
        delimitedDimension: ['apples, grapes'],
        dataSetMetric: [1],
      },
      {
        delimitedDimension: ['oranges'],
        dataSetMetric: [1],
      },
      {
        delimitedDimension: ['bananas, apples'],
        dataSetMetric: [1],
      },
      {
        delimitedDimension: ['grapes, oranges, kiwi'],
        dataSetMetric: [1],
      },
      {
        delimitedDimension: ['apples, bananas, strawberries'],
        dataSetMetric: [1],
      },
    ],
  },
  fields: {
    delimitedDimension: [
      {
        id: 'qt_delimited_fruits',
        name: 'Fruits',
        type: 'TEXT',
        concept: 'DIMENSION',
      },
    ],
    dataSetMetric: [
      {
        id: 'qt_record_count',
        name: 'Record Count',
        type: 'NUMBER',
        concept: 'METRIC',
      },
    ],
  },
  style: {
    fontColor: {
      value: { color: '#000000' },
      defaultValue: { color: '#000000' },
    },
    fontFamily: {
      value: 'Roboto',
      defaultValue: 'Roboto',
    },
    backgroundColor: {
      value: { color: '#ffffff' },
      defaultValue: { color: '#ffffff' },
    },
    borderRadius: {
      value: '4',
      defaultValue: '4',
    },
    opacity: {
      value: '1',
      defaultValue: '1',
    },
    delimiter: {
      value: ',',
      defaultValue: ',',
    },
  },
};
