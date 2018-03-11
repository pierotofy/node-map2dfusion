const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const path = require('path');
const exifParser = require('./libs/exifParser');
const parseDMS = require('parse-dms');
const THREE = require('three');
const utm = require('utm');

const [ imagesDir, outputFile ] = argv._;

if (!fs.existsSync(imagesDir)){
	console.log("Directory does not exist: " + imagesDir);
	process.exit(1);
}

// http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToAngle/
function quaternionToAxisAngle(quaternion){
	if (quaternion.w > 1) quaternion.normalize();
	const angle = 2 * Math.acos(quaternion.w);

	const s = Math.sqrt(1 - quaternion.w * quaternion.w);
	let v;
	if (s < 0.001){
		v = new THREE.Vector3(
				quaternion.x, quaternion.y, quaternion.z
			);
	}else{
		v = new THREE.Vector3(
				quaternion.x / s, quaternion.y / s, quaternion.z / s
			);
	}
	v.multiplyScalar(angle);
	return v;
}

function writeCamerasToOpenSfM(cameras, outputFile){
	const shots = {};

	cameras.forEach(camera => {
		const quaternion = new THREE.Quaternion(camera.rx, camera.ry, camera.rz, camera.rw);
		const axisAngle = quaternionToAxisAngle(quaternion);

		shots[camera.file] = {
	                "orientation": 1, 
	                "camera": "v2 dji fc300s 4000 2250 perspective 0.5555", 
	                "rotation": [
	                    axisAngle.x,
	                    axisAngle.y,
	                    axisAngle.z
	                ], 
	                "translation": [
	                    camera.x,
	                    camera.y,
	                    camera.z
	                ], 
	                "capture_time": 0
				}
	});

	const json = [
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

	fs.writeFileSync(outputFile, JSON.stringify(json));
}

function writeCamerasToMap2DFusion(cameras, outputFile){
	// TX TY TZ (relative to ground, not absolute) RX RY RZ W

	const output = cameras.map(camera => {
		return `${camera.file} ${camera.x} ${camera.y} ${camera.z} ${camera.rx} ${camera.ry} ${camera.rz} ${camera.rw}`
	}).join("\n");

	fs.writeFileSync(outputFile, output);
}

exifParser.readFromFolder(imagesDir)
	.then(data => {
		// Create cameras
		const cameras = [];

		const xAxis = new THREE.Vector3(1, 0, 0),
			  yAxis = new THREE.Vector3(0, 1, 0),
			  zAxis = new THREE.Vector3(0, 0, 1);
		let center = null;

		data.forEach(exif => {
			exif.GPSPosition = exif.GPSPosition.replace(/ deg /g, '°');
			const { lat, lon } = parseDMS(exif.GPSPosition);

			const { easting, northing, zoneNum } = utm.fromLatLon(lat, lon);

			let pitch = parseFloat(exif.Pitch),
				yaw = parseFloat(exif.Yaw);
				// roll = parseFloat(exif.Roll);

			if (exif.CameraPitch !== undefined) pitch = parseFloat(exif.CameraPitch);
			if (exif.CameraYaw !== undefined) yaw = parseFloat(exif.CameraYaw);

			const rotationX = new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(pitch - 90));
			const rotationY = new THREE.Matrix4().makeRotationY(THREE.Math.degToRad(180));
			const rotationZ = new THREE.Matrix4().makeRotationZ(THREE.Math.degToRad(yaw));
			
			const cameraRot = new THREE.Matrix4();
			cameraRot.multiply(rotationX);
			cameraRot.multiply(rotationY);
			cameraRot.multiply(rotationZ);

			const quaternion = new THREE.Quaternion();
			quaternion.setFromRotationMatrix(cameraRot);

			const cameraPos = new THREE.Vector3(easting, northing, parseFloat(exif.RelativeAltitude));
			if (!center) center = cameraPos.clone();
			cameraPos.x = cameraPos.x - center.x;
			cameraPos.y = cameraPos.y - center.y;

			cameraPos.applyQuaternion(quaternion);

			cameras.push({
				file: path.basename(exif.SourceFile),
				x: cameraPos.x,
				y: cameraPos.y,
				z: cameraPos.z,
				rx: quaternion.x,
				ry: quaternion.y,
				rz: quaternion.z,
				rw: quaternion.w
			});
		});

		// writeCamerasToOpenSfM(cameras, '/data/OpenSfM/viewer/fusion.json');
		writeCamerasToMap2DFusion(cameras, outputFile);
	});

