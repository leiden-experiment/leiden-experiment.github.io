function millisecondsToSeconds(time, roundTo = 3) {
  return parseFloat((time / 1000).toFixed(roundTo));
}

function levelStatsToCSV(id, levelStats) {
  if (!levelStats.hasOwnProperty('layersStats')) {
    return '';
  }

  // Row labels.
  let csvContent = id + '\n';

  // Comment out to get data to appear.
  return csvContent;

  csvContent +=
    'layerID,noteID,pinchType,loopNumber,playerTime,correctTime,classification,normalizedTargetRadius,normalizedTargetPositionX,normalizedTargetPositionY,normalizedFingerRadius,normalizedPinkyFingerPositionX,normalizedPinkyFingerPositionY,normalizedRingFingerPositionX,normalizedRingFingerPositionY,normalizedMiddleFingerPositionX,normalizedMiddleFingerPositionY,normalizedIndexFingerPositionX,normalizedIndexFingerPositionY,normalizedThumbFingerPositionX,normalizedThumbFingerPositionY\n';

  let addedRows = 0;

  for (const layerStats of levelStats.layersStats) {
    const layerID = levelStats.layersStats.indexOf(layerStats);
    if (!layerStats.hasOwnProperty('hits')) {
      continue;
    }
    let layerCSV = '';
    for (const hitInfo of layerStats.hits) {
      const fingerRadius = hitInfo.normalizedFingerRadius
        ? hitInfo.normalizedFingerRadius
        : null;
      const [targetX, targetY] = hitInfo.normalizedTargetPosition;
      const [pinkyX, pinkyY] = hitInfo.normalizedPinkyFingerPosition
        ? hitInfo.normalizedPinkyFingerPosition
        : [null, null];
      const [ringX, ringY] = hitInfo.normalizedRingFingerPosition
        ? hitInfo.normalizedRingFingerPosition
        : [null, null];
      const [middleX, middleY] = hitInfo.normalizedMiddleFingerPosition
        ? hitInfo.normalizedMiddleFingerPosition
        : [null, null];
      const [indexX, indexY] = hitInfo.normalizedIndexFingerPosition
        ? hitInfo.normalizedIndexFingerPosition
        : [null, null];
      const [thumbX, thumbY] = hitInfo.normalizedThumbFingerPosition
        ? hitInfo.normalizedThumbFingerPosition
        : [null, null];

      const row = `${layerID},${hitInfo.noteID},${hitInfo.pinchType},${hitInfo.loopNumber},${millisecondsToSeconds(hitInfo.playerTime)},${millisecondsToSeconds(hitInfo.correctTime)},${hitInfo.classification},${hitInfo.normalizedTargetRadius},${targetX},${targetY},${fingerRadius},${pinkyX},${pinkyY},${ringX},${ringY},${middleX},${middleY},${indexX},${indexY},${thumbX},${thumbY}\n`;

      layerCSV += row;
      addedRows++;
    }
    csvContent += layerCSV;
  }
  if (addedRows == 0) {
    return '';
  }
  return csvContent;
}

function addCSVToSheet(sheet, csvData) {
  // Parses CSV file into data array.
  let data = Utilities.parseCsv(csvData);
  // Gets the row and column coordinates for next available range in the spreadsheet.
  let startRow = sheet.getLastRow() + 1;
  let startCol = 1;
  // Determines the incoming data size.
  let numRows = data.length;
  let numColumns = data[0].length;

  // Appends data into the sheet.
  sheet.getRange(startRow, startCol, numRows, numColumns).setValues(data);
}

// slice the word "participant" off the front.
function removeParticipantPrefix(str) {
  if (typeof str !== 'string') {
    return str; // Return the input if it's not a string
  }
  const prefix = 'participant';
  if (str.toLowerCase().startsWith(prefix)) {
    return str.slice(prefix.length);
  } else {
    return str; // Return the original string if the prefix is not found
  }
}

function formatDateString(dateString) {
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return 'Invalid Date'; // Handle invalid date strings
  }

  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  return date.toLocaleString(undefined, options).replace(/,/g, '');
}

function formatDateWithoutCommas(date) {
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZoneName: 'short', // or 'long' for more detail
  };

  return date.toLocaleString(undefined, options).replace(/,/g, '');
}

function centerSheetCells(sheet) {
  var range = sheet.getDataRange();

  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
}

function autoResizeColumns(sheet) {
  var dataRange = sheet.getDataRange();
  var lastColumn = dataRange.getLastColumn();

  for (var i = 1; i <= lastColumn; i++) {
    sheet.autoResizeColumn(i);
  }
}

function rowColumnToCellAddress(row, column) {
  if (row < 1 || column < 1) {
    return 'Invalid row or column number';
  }

  let columnAddress = '';
  let tempColumn = column;

  while (tempColumn > 0) {
    let remainder = (tempColumn - 1) % 26;
    columnAddress = String.fromCharCode(65 + remainder) + columnAddress;
    tempColumn = Math.floor((tempColumn - 1) / 26);
  }

  return columnAddress + row;
}

function insertSheetLink(ss, sheet, sheetLinkTo, row, column) {
  const cellAddress = rowColumnToCellAddress(row, column);
  var linksheet = ss.getSheetByName(sheetLinkTo);

  if (!linksheet) {
    Logger.log("Sheet '" + sheetLinkTo + "' not found.");
    return;
  }

  var sheetId = linksheet.getSheetId();
  var ssId = ss.getId();
  var link = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${sheetId}", "${sheetLinkTo}")`;

  sheet.getRange(cellAddress).setFormula(link);
}

function createSheetLinksFromColumnA(ss, sheet) {
  var lastRow = sheet.getLastRow();

  for (var i = 2; i <= lastRow; i++) {
    // Start from row 2 (skipping row 1)
    var sheetName = sheet.getRange('A' + i).getValue(); // Get sheet name from column A
    if (sheetName) {
      // Check if the cell has a value
      var targetSheet = ss.getSheetByName(sheetName);
      if (targetSheet) {
        var sheetId = targetSheet.getSheetId();
        var ssId = ss.getId();
        var link = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${sheetId}", "${sheetName}")`;
        sheet.getRange('A' + i).setFormula(link); // Set the cell's formula to the hyperlink
      } else {
        Logger.log("Sheet '" + sheetName + "' not found.");
      }
    }
  }
}

function sortParticipantsToArray(participantsObject) {
  try {
    const participantsArray = Object.values(participantsObject);

    participantsArray.sort((participantA, participantB) => {
      const nameA = participantA.name || '';
      const nameB = participantB.name || '';

      const matchA = nameA.match(/participant(\d+)/);
      const matchB = nameB.match(/participant(\d+)/);

      const numA = matchA ? parseInt(matchA[1], 10) : Infinity;
      const numB = matchB ? parseInt(matchB[1], 10) : Infinity;

      return numA - numB;
    });

    return JSON.stringify(participantsArray, null, 2);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return null;
  }
}

// Reads data from Firebase Database that is >50Mb
// Splits up the read calls based on data keys
function readBulkDataFromFirebase(url, secret, split, start = null) {
  //console.log(`Searching for next ${split} from [${start}]`);

  let base = FirebaseApp.getDatabaseByUrl(url, secret);

  let queryParams = { orderBy: '$key', limitToFirst: split + 1 };

  if (start !== null) {
    queryParams.startAfter = start;
  } else {
    // First query will return 1 more item than others because it does not start after a key.
    queryParams.limitToFirst -= 1;
  }

  let data = base.getData('users', queryParams);

  if (!data) {
    return null;
  }

  let keys = Object.keys(data);

  //console.log("Found keys:", keys);

  let nextStart = keys[keys.length - 1]; // The last key we grabbed plus space " "
  return {
    ...data,
    ...readBulkDataFromFirebase(url, secret, split, nextStart),
  };
}

function getAllPizzicatoData() {
  const databaseURL =
    'https://pizzicato-1f765-default-rtdb.europe-west1.firebasedatabase.app/';
  const secret = 'REPLACEWITHSECRETKEY';

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheets = ss.getSheets();

  const existingSheetNames = sheets.map(sheet => sheet.getName());

  const fetchUsersAtATime = 10;

  const dbData = readBulkDataFromFirebase(
    databaseURL,
    secret,
    fetchUsersAtATime,
  );

  if (!dbData) {
    console.error('Failed to find user data');
    return;
  }

  const users = Object.values(dbData);

  const participantCount = Object.keys(dbData).length;

  console.log(`INFO: Found ${participantCount} participants`);

  if (!existingSheetNames.includes('Overview')) {
    ss.insertSheet('Overview');
  }

  for (let i = 1; i <= participantCount; i++) {
    const sheetName = String(i);
    if (!existingSheetNames.includes(sheetName)) {
      try {
        ss.insertSheet(sheetName);
        console.log(`INFO: Sheet "${sheetName}" created.`);
      } catch (error) {
        Logger.log(`Error creating sheet "${sheetName}": ${error}`);
      }
    } else {
      // console.log(`INFO: Sheet "${sheetName}" already exists.`);
    }
  }

  console.log('INFO: Sorting users...');

  users.sort((participantA, participantB) => {
    const nameA = participantA.name || '';
    const nameB = participantB.name || '';

    const matchA = nameA.match(/participant(\d+)/);
    const matchB = nameB.match(/participant(\d+)/);

    const numA = matchA ? parseInt(matchA[1], 10) : Infinity;
    const numB = matchB ? parseInt(matchB[1], 10) : Infinity;

    return numA - numB;
  });

  console.log('INFO: Sorting completed!');

  const overviewSheet = ss.getSheetByName('Overview');
  overviewSheet.getDataRange().clearContent();

  console.log('INFO: Cleared overview sheet');

  addCSVToSheet(
    overviewSheet,
    'Participant Number,Config,Experiment Start,Week,Last Login,Total Trainings Completed\n',
  );

  console.log('INFO: Adding user sheets...');

  for (var index in users) {
    const user = users[index];
    const participantNumber = removeParticipantPrefix(user.name);
    const userSheet = ss.getSheetByName(participantNumber);
    userSheet.getDataRange().clearContent();
    let csv = 'Username:,' + user.name + '\n';
    let overviewCSV = participantNumber + ',';
    csv += 'Config:,' + user.config + '\n';
    overviewCSV += user.config + ',';
    const startDate = formatDateString(user.experimentStart);
    csv += 'Experiment Start:,' + startDate + '\n';
    overviewCSV += startDate + ',';
    csv += 'Week:,' + user.week + '\n';
    overviewCSV += user.week + ',';
    const date = new Date(user.lastLogin);
    const dateString = formatDateWithoutCommas(date);
    csv += 'Last Login:,' + dateString + '\n';
    overviewCSV += dateString + ',';
    csv += 'Total Trainings Completed:,' + user.trainingsCompleted + '\n';
    overviewCSV += user.trainingsCompleted + '\n';
    csv += '\n';
    let layerCSV = '';
    for (var dataId in user.data) {
      const data = user.data[dataId];
      layerCSV += levelStatsToCSV(dataId, data);
    }
    csv += layerCSV;
    addCSVToSheet(overviewSheet, overviewCSV);
    addCSVToSheet(userSheet, csv);
    //centerSheetCells(userSheet);
  }

  console.log('INFO: Script completed!');

  centerSheetCells(overviewSheet);
  autoResizeColumns(overviewSheet);
  createSheetLinksFromColumnA(ss, overviewSheet);
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp, SlidesApp or FormApp.
  ui.createMenu('Pizzicato Scripts')
    .addItem('Refresh All Data', 'getAllPizzicatoData')
    .addToUi();
}

// function getFirebaseUrl(jsonPath) {
//   /*
//   We then make a URL builder
//   This takes in a path, and
//   returns a URL that updates the data in that path
//   */
//   return (
//     'https://pizzicato-1f765-default-rtdb.europe-west1.firebasedatabase.app/' +
//     jsonPath +
//     '.json?auth=' +
//     secret
//   )
// }

// function syncMasterSheet(excelData) {
//   /*
//   We make a PUT (update) request,
//   and send a JSON payload
//   More info on the REST API here : https://firebase.google.com/docs/database/rest/start
//   */
//   var options = {
//     method: 'put',
//     contentType: 'application/json',
//     payload: JSON.stringify(excelData)
//   }
//   var fireBaseUrl = getFirebaseUrl('masterSheet')

//   /*
//   We use the UrlFetchApp google scripts module
//   More info on this here : https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
//   */
//   UrlFetchApp.fetch(fireBaseUrl, options)
// }

// function startSync() {
//   //Get the currently active sheet
//   var sheet = SpreadsheetApp.getActiveSheet()
//   //Get the number of rows and columns which contain some content
//   var [rows, columns] = [sheet.getLastRow(), sheet.getLastColumn()]
//   //Get the data contained in those rows and columns as a 2 dimensional array
//   var data = sheet.getRange(1, 1, rows, columns).getValues()

//   //Use the syncMasterSheet function defined before to push this data to the "masterSheet" key in the firebase database
//   syncMasterSheet(data)
// }

//getAllPizzicatoData();
