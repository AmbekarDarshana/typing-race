function cleanRoom(room) {
  return String(room || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 20);
}

function cleanName(name, socketId) {
  return String(name || "").trim().slice(0, 16) || "Player " + socketId.slice(0, 4);
}

// how many characters match the text before the first mistake
function countCorrect(typed, text) {
  let correct = 0;
  while (correct < typed.length && typed[correct] === text[correct]) {
    correct++;
  }
  return correct;
}

// standard rule: 5 characters = 1 word
function calcWpm(correctChars, elapsedMs) {
  const minutes = Math.max(elapsedMs / 60000, 0.001);
  return Math.round(correctChars / 5 / minutes);
}

function calcAccuracy(keys, mistakes) {
  return keys ? Math.round(((keys - mistakes) / keys) * 100) : 100;
}

module.exports = { cleanRoom, cleanName, countCorrect, calcWpm, calcAccuracy };