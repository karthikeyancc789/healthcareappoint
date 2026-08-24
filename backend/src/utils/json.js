const fs = require('fs');

const readJson = (filePath) => {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const writeJson = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

module.exports = { readJson, writeJson };