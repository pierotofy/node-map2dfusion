const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const glob = require("glob")

const [ imagesDir, outputFile ] = argv._;

const exiftool = require('node-exiftool')
const ep = new exiftool.ExiftoolProcess()

ep
  .open()
  .then(() => ep.readMetadata(imagesDir, ['-File:all']))
  .then(({data}) => {
  	data.forEach(datum => {
  		console.log(datum.SourceFile);
  	});
  })
  .then(() => ep.close())
  .catch(console.error)

