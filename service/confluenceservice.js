
import fetch from  "node-fetch";
import dotenv from  "dotenv";
import fs from  "fs";
import FormData from  "form-data";
import path from  "path";
import puppeteer from  "puppeteer";
dotenv.config();
const mFilesUrl = process.env.M_FILES_URL || "http://3.6.163.114";
const mFilesUsername = process.env.M_FILES_USERNAME;
const mFilesPassword = process.env.M_FILES_PASSWORD;
const mFilesVaultId = process.env.M_FILES_VAULT_ID;
const confluenceUrl = process.env.CONFLUENCE_URL + "/5341188";
const email = process.env.CONFLUENCE_EMAIL;
const apiToken = process.env.CONFLUENCE_API_TOKEN;
const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

// variables
const extractObject = {}


const getDataFromConfluence = async () => {
  const authTokenM_files = await mFilesAuthTokenGenrator(); // get authication token for M-Files 
  const expandProperties = ["body.view", "childTypes.attachment", "children.attachment"];
  const expandParam = expandProperties.join(",");
  try {
    // fetching data from confluence
    const response = await fetch(`${confluenceUrl}?expand=${expandParam}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return (`HTTP error! status: ${response.status}`)
    };
    const data = await response.json();
    if (data) {

      extractObject['htmlContent'] = data.body && data.body.view ? data.body.view.value : "No HTML content available";
      extractObject['title'] = data['title'];
      extractObject['finalHtml'] = `<h1>${extractObject.title}</h1>${extractObject.htmlContent}`;
      extractObject['isAttachment'] = data.childTypes.attachment.value;
      extractObject['attachmentresult'] = data.children.attachment.results || [];

      if (extractObject['isAttachment'] === true) {
        if (extractObject['attachmentresult'] && extractObject['attachmentresult'].length > 0) {
          extractObject['finalHtml'] = await workOnResponse(extractObject)
        }
      }

      await generatePdfFromHtml(extractObject['finalHtml']);
      const metaObject = {
        status: data.status,
        type: data.type,
        page_Id: data.id,
        title: data.title,
      };
      UploadFileMFiles(authTokenM_files, metaObject);
     return {
        result : extractObject['finalHtml'],
        error : ""
     };
    }
  } catch (error) {
  return {
    return : '',
    error : error.message
  }
  }
};

const workOnResponse = async (data) => {
  let results = ''
  for (let i = 0; i < data['attachmentresult'].length; i++) {
    const element = data['attachmentresult'][i];
    const attachmentTitle = element.extensions.fileId + "_" + element.title;  // File name for images store inside the media folder
    let downloadUrl = element._links.download; //URL from where images is getting downloaded 
    downloadUrl = process.env.CONFLUENCE_BASE_URL + downloadUrl || 'https://acme-organization.atlassian.net/wiki' + downloadUrl; // modifiy the url which help to download the image 
    const savedFilePath = await downloadImage(downloadUrl, attachmentTitle); // images are downloaded inside the media folder
    results = await replaceImageSources(data['htmlContent'], savedFilePath, element.extensions.fileId); // replace source path of the image
  }
  return results; // return the updated html code with updated src 
};

const getRelativePathFromMedia = (absolutePath) => {
  const mediaFolderPath = path.resolve('media');  
 const relativePath = path.relative(mediaFolderPath, absolutePath);  
 return `/media/${relativePath}`; 
};


const downloadImage = async (imageUrl, savePath) => {
  const mediaFolder = path.resolve("media");
  if (!fs.existsSync(mediaFolder)) {
    fs.mkdirSync(mediaFolder);
  }

  const filePath = path.resolve(mediaFolder, savePath);
  const response = await fetch(imageUrl, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      'Accept': 'image/*',  // Accept only image files
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download image. Status: ${response.status}`);
  }

  const fileStream = fs.createWriteStream(filePath);
  await response.body.pipe(fileStream);

  return filePath;
};

const replaceImageSources = (htmlContent, savedFilePath, id) => {
  let check = htmlContent.includes(id);
  if (check) {
    let regex = new RegExp(`<[^>]*id=["']${id}["'][^>]*>.*?</[^>]+>`, 'g');
    let matches = htmlContent.match(regex);

    if (matches && matches.length > 0) {
      matches.forEach((match) => {
        const relativePath = getRelativePathFromMedia(savedFilePath).replace(/\\/g, '/');
        const serverUrl = `http://localhost:3000${relativePath}`;

        let updatedMatch = match
          .replace(/src=["'][^"']*["']/g, `src="${serverUrl}"`)
          .replace(/srcset=["'][^"']*["']/g, `srcset="${serverUrl}"`);

        htmlContent = htmlContent.replace(match, updatedMatch);
      });

      return htmlContent;
    } else {
      return htmlContent;
    }
  } else {
    return htmlContent;
  }
};

const generatePdfFromHtml = async (htmlContent) => {
  try {
    const pdfPath = path.resolve("output/generated-page-content.pdf");
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: "screenshort.png", fullPage: true });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();
  } catch (error) {
    throw new Error(error.message);
  }
};

const mFilesAuthTokenGenrator = async () => {
  try {
    const authResponse = await fetch(`${mFilesUrl}/REST/server/authenticationtokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: mFilesUsername,
        password: mFilesPassword,
        vaultGuid: mFilesVaultId,
        Expiration: "2025-01-01T23:59:00Z",
      }),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(`Authentication failed. Status: ${authResponse.status}. Message: ${errorText}`);
    }

    const authData = await authResponse.json();
    return authData.Value;
  } catch (error) {
    throw new Error(error.message);
  }
};


const UploadFileMFiles = async (X_Authentication, metaObject) => {
  try {
    const filePath = path.resolve("output/generated-page-content.pdf");
    if (!fs.existsSync(filePath)) throw new Error("PDF file does not exist!");

    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));

    const header = {
      "m-files-vault": process.env.M_FILES_VAULT_ID,
      host: "3.6.163.114",
      "X-Authentication": X_Authentication,
      "m-files-session": process.env.M_FILES_SESSION,
      ...formData.getHeaders(),
    };

    const apiCall = await fetch("http://3.6.163.114/REST/files.aspx", {
      method: "POST",
      headers: header,
      body: formData,
    });

    if (!apiCall.ok) throw new Error(`Temporary file upload failed. HTTP status: ${apiCall.status}`);

    const apiResponse = await apiCall.json();

    const appendBody = {
      PropertyValues: [
        {
          PropertyDef: 100,
          TypedValue: {
            DataType: 9,
            HasValue: true,
            Value: null,
            Lookup: {
              Deleted: false,
              DisplayValue: null,
              Hidden: false,
              Item: 0,
              Version: -1,
            },
          },
        },
        {
          PropertyDef: 0,
          TypedValue: {
            DataType: 1,
            HasValue: true,
            Value: metaObject.title,
          },
        },
        {
          PropertyDef: 1029,
          TypedValue: {
            DataType: 1,
            HasValue: true,
            Value: metaObject.status,
          },
        },
        {
          PropertyDef: 1026,
          TypedValue: {
            DataType: 1,
            HasValue: true,
            Value: metaObject.page_Id,
          },
        },
        {
          PropertyDef: 1027,
          TypedValue: {
            DataType: 1,
            HasValue: true,
            Value: metaObject.type,
          },
        },
      ],
      Files: [apiResponse],
    };

    const finalUploadFileOnServer = await fetch("http://3.6.163.114/REST/objects/0.aspx", {
      method: "POST",
      headers: {
        "m-files-vault": process.env.M_FILES_VAULT_ID,
        host: "3.6.163.114",
        "X-Authentication": X_Authentication,
        "m-files-session": process.env.M_FILES_SESSION,
      },
      body: JSON.stringify(appendBody),
    });

    if (!finalUploadFileOnServer.ok) throw new Error(`File metadata upload failed. HTTP status: ${finalUploadFileOnServer.status}`);
    console.log("file uploaded successfully .... , finalUploadFileOnServer")
  } catch (error) {
    throw new Error(error.message);
  }
};




export const getConfluenceData = async () => {
   return  await getDataFromConfluence();
  };

  export default {
    getConfluenceData,
  };