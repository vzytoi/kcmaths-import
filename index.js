const fs = require('fs');
const prompt = require('prompt');
const cheerio = require('cheerio');
const axios = require('axios');
const FormData = require('form-data');

const devMode = true;

prompt.start();

const separator = "================================================================================"
const separatorText = (text) => {
	const textLength = text.length;
	const separatorLength = separator.length - (textLength + 2);
	return separator.substring(0, (separatorLength / 2)) + " " + text + " " + separator.substring(0, (separatorLength % 2) + (separatorLength / 2));
};


console.log(`\n${separator}\n`);
start();
function start() {
	var schema = {
		properties: {
		"Nom d'utilisateur": {
			pattern: /^[a-zA-Z]+$/,
			message: "Le nom d'utilisateur doit contenir que des caracteres du type [a-zA-Z]",
			required: true
		},
		"Mot de passe": {
			hidden: true,
			required: true,
			replace: '*'
		}
		}
	  };
	
	prompt.get(schema, function (err, result) {
		if (err) { return onErr(err); }
	
		const userName = result['Nom d\'utilisateur'];
		const userPassword = result['Mot de passe'];
		main(userName, userPassword);
	});
}


async function main (userName, userPassword) {

	function logStart() {
		console.log(`\n${separatorText("Démarrage de l'application")}\n`);
		console.log(`  Nom d'utilisateur: ${userName}`);
		console.log(`  Mot de passe: ${userPassword.replace(/./g, '*')}`);
		console.log(`\n${separator}\n`);
	}
	
	function logEnd() {
		console.log(`\n${separator}\n`);
		console.log("  Tout les fichiers ont été téléchargés");
		console.log("  Merci d'avoir utilisé ce script !");
		console.log(`\n${separator}\n`);
	}

	function checkResponseCode(code) {
		if (code === 200) {
			return true;
		} if (code === 429) {
			console.log("  Erreur: Trop de requetes, veuillez réessayer plus tard");
		} else {
			console.log("  Erreur: Un erreur est survenue, veuillez réessayer plus tard. Code: ", code);
		}
		false
	}

	async function getPhpSessionId(userName, userPassword) {
		return new Promise((resolve, reject) => {
			var bodyFormData = new FormData();
			bodyFormData.append('nom_session', userName);
			bodyFormData.append('mot_de_passe', userPassword);

			axios({
				method: 'POST',
				url: `https://kcmaths.com/index.php`,
				data: bodyFormData,
				headers: { "Content-Type": "multipart/form-data" },
			})
			.then(function (res) {
				if (checkResponseCode(res.status)) {
					if (res.data.includes("Pas de connexion, pas de crampons")) {
						resolve(false)
					}
					const cookie = res.headers['set-cookie'][0];
					const phpSessionId = cookie.substring(cookie.indexOf("=") + 1, cookie.indexOf(";"));
					resolve(phpSessionId);
				}
			})
		});
	}

	const phpSessionId = await getPhpSessionId(userName, userPassword);
	if (!phpSessionId) {
		console.log(`\n${separator}\n`);
		console.log(`  Le nom d'utilisateur ou le mot de passe est incorrect`);
		console.log(`\n${separator}\n`);
		start();
		return
	}

	logStart();


	const getHtml = async (url) => {
		return new Promise((resolve, reject) => {
			try {
				var bodyFormData = new FormData();
				bodyFormData.append('nom_session', userName);
				bodyFormData.append('mot_de_passe', userPassword);

				axios({
					method: 'GET',
					url: `https://kcmaths.com/documents_sommaire.php`,
					data: bodyFormData,
					headers: { 
						"Content-Type": "multipart/form-data",
						"Cookie": `PHPSESSID=${phpSessionId}`
					},
				})
				.then(function (res) {
					if (checkResponseCode(res.status)) {
						resolve(res.data);
					}
				})
			}
			catch (e) {
				console.log(e);
				reject(e);
			}
		});
	}

	const documentsPage = await getHtml("/documents_sommaire.php"); //fs.readFileSync('./html.html', 'utf8');
	const documentsPageHtml = cheerio.load(documentsPage, null, false);

	// Get the div with the class "accueil"
	const divAccueil = documentsPageHtml("div.accueil");
	var documents = [];

	for (element of divAccueil.children()) {
		if (element.name === 'h1') {
			documents.push([element.children[0].data])
		}
		else if (element.name === 'table' && element.children[1].name === 'tbody') {
			for (tr of element.children[1].children) {
				if (tr.name === 'tr') {
					const tdLink = tr.children[0];
					const tdTitle = tr.children[2];
					const tdLinkChildren = tdLink.children.filter(x => x.name === 'a');

					const link = tdLinkChildren[0].attribs.href;
					const title = tdTitle.children[0].data;

					documents[documents.length - 1].push({
						link,
						title
					});
				}
			}
		}
	}


	for (folder of documents) {
		const folderName = folder[0];

		let i= 0;
		for (document of folder.slice(1)) {
			const documentName = document.title;
			const documentLink = document.link;

			// If include Chapitre in document name, create a folder with the name of the document
			// "Chapitre 1" => chapter 1, "Chapter 10" => chapter 10
			// Sort by chapter / folderName

			const chapter = documentName.includes("Chapitre") ? parseInt(documentName.split("Chapitre ")[1]) : null;

			function checkFolder (folderPath) {
				if (!fs.existsSync(folderPath)) {
					fs.mkdirSync(folderPath);
				}
			}

			if (chapter) {
				checkFolder(`./Chapitre ${chapter}`);
				checkFolder(`./Chapitre ${chapter}/${folderName}`);
			}
			else {
				checkFolder(`./${folderName}`);
			}

			const documentPath = chapter ? `./Chapitre ${chapter}/${folderName}` : `./${folderName}`;
			let fileName = documentName.trim().replace(/[^a-zA-Z0-9_éêèàùïüëöâôûç]/g, '_').trim().replace(/_+/g, '_');
			while (fileName.endsWith('_')) {
				fileName = fileName.substring(0, fileName.length - 1);
			}
			while (fileName.startsWith('_')) {
				fileName = fileName.substring(1, fileName.length);
			}

				


			const filePath = `${documentPath}/${fileName}.pdf`;

			if (!fs.existsSync(filePath)) {
				// Encode base64 username:password
				const authorization = "Basic " + Buffer.from(userName + ":" + userPassword).toString('base64');

				axios({
					method: 'GET',
					url: `https://kcmaths.com/${documentLink}`,
					headers: {
						Authorization: authorization
					},
					responseType: 'stream'
				})
				.then(function (res) {
					res.data.pipe(fs.createWriteStream(filePath))
					console.log(`Fichier téléchargé: ${fileName}`)
				})
			}
		}
	}
}