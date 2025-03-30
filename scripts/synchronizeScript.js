function millisecondsToSeconds(time, roundTo = 3) {
  return parseFloat((time / 1000).toFixed(roundTo));
}

function levelStatsToCSV(id, levelStats) {
  if (!levelStats.hasOwnProperty('layersStats')) {
    return '';
  }

  let csvContent = id + '\n';

  // Row labels.
  csvContent +=
    'layerID,noteID,pinchType,loopNumber,playerTime,correctTime,classification,normalizedTargetRadius,normalizedTargetPositionX,normalizedTargetPositionY,normalizedFingerRadius,normalizedPinkyFingerPositionX,normalizedPinkyFingerPositionY,normalizedRingFingerPositionX,normalizedRingFingerPositionY,normalizedMiddleFingerPositionX,normalizedMiddleFingerPositionY,normalizedIndexFingerPositionX,normalizedIndexFingerPositionY,normalizedThumbFingerPositionX,normalizedThumbFingerPositionY\n';

  let addedRows = 0;

  for (const layerStats of levelStats.layersStats) {
    const layerID = levelStats.layersStats.indexOf(layerStats);
    if (!layerStats.hasOwnProperty('hits')) {
      continue;
    }
    for (const hitInfo of layerStats.hits) {
      if (
        !hitInfo.hasOwnProperty('noteID') ||
        !hitInfo.hasOwnProperty('pinchType') ||
        !hitInfo.hasOwnProperty('loopNumber') ||
        !hitInfo.hasOwnProperty('playerTime') ||
        !hitInfo.hasOwnProperty('correctTime') ||
        !hitInfo.hasOwnProperty('classification') ||
        !hitInfo.hasOwnProperty('normalizedTargetRadius') ||
        !hitInfo.hasOwnProperty('normalizedTargetPosition') ||
        !hitInfo.hasOwnProperty('normalizedFingerRadius') ||
        !hitInfo.hasOwnProperty('normalizedPinkyFingerPosition') ||
        !hitInfo.hasOwnProperty('normalizedRingFingerPosition') ||
        !hitInfo.hasOwnProperty('normalizedMiddleFingerPosition') ||
        !hitInfo.hasOwnProperty('normalizedIndexFingerPosition') ||
        !hitInfo.hasOwnProperty('normalizedThumbFingerPosition')
      ) {
        continue;
      }
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

      csvContent += row;
      addedRows++;
    }
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

function getAllPizzicatoData() {
  const databaseURL =
    'https://pizzicato-1f765-default-rtdb.europe-west1.firebasedatabase.app/';
  const secret = 'REPLACEWITHSECRETKEY';

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheets = ss.getSheets();

  // 4. Get the database reference
  const db = FirebaseApp.getDatabaseByUrl(databaseURL, secret); // Use databaseURL

  const userData = JSON.parse(JSON.stringify(db.getData()));
  const users = userData['users'];

  sheets.forEach(function (sheet) {
    if (sheet.getName() != 'BaseSheet') {
      ss.deleteSheet(sheet);
    }
  });

  const overviewSheet = ss.insertSheet('Overview');

  addCSVToSheet(
    overviewSheet,
    'Participant Number,Config,Experiment Start,Week,Last Login,Total Trainings Completed\n',
  );

  for (var key in users) {
    const user = users[key];
    if (user.hasOwnProperty('name')) {
      const participantNumber = removeParticipantPrefix(user.name);
      const userSheet = ss.insertSheet(participantNumber);
      let csv = 'Username:,' + user.name + '\n';
      let overviewCSV = participantNumber + ',';
      if (user.hasOwnProperty('config')) {
        csv += 'Config:,' + user.config + '\n';
        overviewCSV += user.config + ',';
      }
      if (user.hasOwnProperty('experimentStart')) {
        const startDate = formatDateString(user.experimentStart);
        csv += 'Experiment Start:,' + startDate + '\n';
        overviewCSV += startDate + ',';
      }
      if (user.hasOwnProperty('week')) {
        csv += 'Week:,' + user.week + '\n';
        overviewCSV += user.week + ',';
      }
      if (user.hasOwnProperty('lastLogin')) {
        const date = new Date(user.lastLogin);
        const dateString = formatDateWithoutCommas(date);
        csv += 'Last Login:,' + dateString + '\n';
        overviewCSV += dateString + ',';
      }
      if (user.hasOwnProperty('trainingsCompleted')) {
        csv += 'Total Trainings Completed:,' + user.trainingsCompleted + '\n';
        overviewCSV += user.trainingsCompleted + '\n';
      } else {
        // TODO: Remove this?
        overviewCSV += '0' + '\n';
      }
      if (user.hasOwnProperty('data')) {
        csv += '\n';
        for (var dataId in user.data) {
          const data = user.data[dataId];
          csv += levelStatsToCSV(dataId, data);
        }
      }
      addCSVToSheet(overviewSheet, overviewCSV);
      addCSVToSheet(userSheet, csv);
      //centerSheetCells(userSheet);
    }
  }

  centerSheetCells(overviewSheet);
  autoResizeColumns(overviewSheet);
  createSheetLinksFromColumnA(ss, overviewSheet);

  //var sheet = sheets.getSheetByName(name);

  // if (yourNewSheet != null) {
  //     activeSpreadsheet.deleteSheet(yourNewSheet);
  // }

  // yourNewSheet = activeSpreadsheet.insertSheet();
  // yourNewSheet.setName(name);

  // for (i = 0; i < users.length; i++) {
  //   userData[i];
  // }
  // sheet.getRange("A1").setNumberFormat('@STRING@').setValue(userData);
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
