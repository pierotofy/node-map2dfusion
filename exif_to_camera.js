const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const exifParser = require('./libs/exifParser');
const parseDMS = require('parse-dms');
const THREE = require('three');
const utm = require('utm');

const [ imagesDir, outputFile ] = argv._;


function rotate(vector, angleaxis) {
    var v = new THREE.Vector3(vector[0], vector[1], vector[2]);
    var axis = new THREE.Vector3(angleaxis[0],
                                 angleaxis[1],
                                 angleaxis[2]);
    var angle = axis.length();
    axis.normalize();
    var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
    v.applyMatrix4(matrix);
    return v;
}

exifParser.readFromFolder(imagesDir)
	.then(data => {
		// Create cameras
		const cameras = [];
		const shots = {};

		const xAxis = new THREE.Vector3(1, 0, 0),
			  yAxis = new THREE.Vector3(0, 1, 0),
			  zAxis = new THREE.Vector3(0, 0, 1);
		let center = null;


		data.forEach(exif => {
			exif.GPSPosition = exif.GPSPosition.replace(/ deg /g, '°');
			const { lat, lon } = parseDMS(exif.GPSPosition);

			const { easting, northing, zoneNum } = utm.fromLatLon(lat, lon);

			let pitch = parseFloat(exif.Pitch),
				yaw = parseFloat(exif.Yaw),
				roll = parseFloat(exif.Roll);

			if (exif.CameraPitch) pitch += parseFloat(exif.CameraPitch);
			if (exif.CameraYaw) yaw += parseFloat(exif.CameraYaw);
			if (exif.CameraRoll) roll += parseFloat(exif.CameraRoll);

			const cameraRot = new THREE.Vector3(0, Math.PI, 0);
			// cameraRot.applyAxisAngle(zAxis, THREE.Math.degToRad(pitch));
			// cameraRot.applyAxisAngle(yAxis, THREE.Math.degToRad(yaw));
			// cameraRot.applyAxisAngle(xAxis, THREE.Math.degToRad(roll));
			// cameraRot.normalize();

			const quaternion = new THREE.Quaternion();
			quaternion.setFromAxisAngle( cameraRot, Math.PI );

			const cameraPos = new THREE.Vector3(easting, northing, parseFloat(exif.RelativeAltitude));
			if (!center) center = cameraPos.clone();
			cameraPos.x = cameraPos.x - center.x;
			cameraPos.y = cameraPos.y - center.y;

			cameras.push({
				file: exif.SourceFile,
				x: cameraPos.x,
				y: cameraPos.y,
				z: cameraPos.z,
				rot: cameraRot,
				rx: quaternion.x,
				ry: quaternion.y,
				rz: quaternion.z,
				rw: quaternion.w
			});

			shots[exif.SourceFile] = {
                "orientation": 1, 
                "camera": "v2 dji fc300s 4000 2250 perspective 0.5555", 
                "gps_position": [
                    cameraPos.x,
                    cameraPos.y,
                    cameraPos.z
                ], 
                "gps_dop": 0, 
                "rotation": [
                    cameraRot.x,
                    cameraRot.y,
                    cameraRot.z
                ], 
                "translation": [
                    cameraPos.x,
                    cameraPos.y,
                    cameraPos.z
                ], 
                "capture_time": 0
			}
		});

		let out = [
    	{
        "cameras": {
            "v2 dji fc300s 4000 2250 perspective 0.5555": {
                "focal_prior": 0.5555555555555556, 
                "width": 4000, 
                "k1": 0.0009621221480173682, 
                "k2": 0.012564384069413442, 
                "k1_prior": 0.0, 
                "k2_prior": 0.0, 
                "projection_type": "perspective", 
                "focal": 0.5557508768659184, 
                "height": 2250
            }
        }, 
        "shots": shots}];

       fs.writeFileSync('/data/OpenSfM/viewer/fusion.json', JSON.stringify(out));
            

		// TX TY TZ (relative to ground, not absolute) RX RY RZ W
	});

