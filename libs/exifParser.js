const exiftool = require('node-exiftool');
const ep = new exiftool.ExiftoolProcess();

module.exports = {
	readFromFolder: (folder) => {
		return new Promise((resolve, reject) => {
			ep
			  .open()
			  .then(() => ep.readMetadata(folder, ['-File:all']))
			  .then(({data}) => {
			  	resolve(data);
			  })
			  .then(() => ep.close())
			  .catch(reject);
		});
	}
}