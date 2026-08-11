function querySuffix(query) {
  return query ? '?' + query : '';
}

export function buildGoogleSheetsValuesUrl(spreadsheetId, range, query = '') {
  return (
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    spreadsheetId +
    '/values/' +
    encodeURIComponent(range) +
    querySuffix(query)
  );
}

export function buildGoogleSheetsAppendUrl(spreadsheetId, range, query = '') {
  return (
    buildGoogleSheetsValuesUrl(spreadsheetId, range) +
    ':append' +
    querySuffix(query)
  );
}
