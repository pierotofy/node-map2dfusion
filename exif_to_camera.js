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
            "height": 3000
        }
    }, 
    "shots": shots}];

	fs.writeFileSync(outputFile, JSON.stringify(json));
}

function writeCamerasToMap2DFusion(cameras, outputFile){
	// TX TY TZ (relative to ground, not absolute) RX RY RZ W

	const output = cameras.map(camera => {
		return `${camera.file.replace(/\.\w{3,4}$/, "")} ${camera.x.toFixed(6)} ${camera.y.toFixed(6)} ${camera.z.toFixed(6)} ${camera.rx.toFixed(6)} ${camera.ry.toFixed(6)} ${camera.rz.toFixed(6)} ${camera.rw.toFixed(6)}`
	}).join("\n");

	fs.writeFileSync(outputFile, output);
}

exifParser.readFromFolder(imagesDir)
	.then(data => {
		// Create cameras
		const cameras = [];

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

			// if (Math.abs(yaw) > 90){
			// 	yaw += 180;
			// }

			const rotationX = new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(90 - pitch));
			const rotationY = new THREE.Matrix4().makeRotationY(THREE.Math.degToRad(180));
			const rotationZ = new THREE.Matrix4().makeRotationZ(THREE.Math.degToRad(180 - yaw));
			
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

			// cameraPos.applyQuaternion(quaternion);

			const rotWorld = new THREE.Matrix4();
			// rotWorld.multiply(new THREE.Matrix4().makeRotationZ(THREE.Math.degToRad(-90	)));
			rotWorld.multiply(new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(180)));
			// rotWorld.multiply(new THREE.Matrix4().makeRotationZ(THREE.Math.degToRad(-270)));


			const quatWorld = new THREE.Quaternion();
			quatWorld.setFromRotationMatrix(rotWorld);

			quaternion.multiply(quatWorld);

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

		writeCamerasToOpenSfM(cameras, '/data/OpenSfM/viewer/fusion.json');
		writeCamerasToMap2DFusion(cameras, outputFile);
	});

