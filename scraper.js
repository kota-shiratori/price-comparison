const fs = require("fs");
const { google } = require("googleapis");
const { chromium } = require("playwright");
import { GOOGLE_SHEET_ID } from "./env";

// Google Sheets APIの認証
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TOKEN_PATH = "token.json";
const CREDENTIALS_PATH = "credentials.json";

async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("Authorize this app by visiting this url:", authUrl);
    const code = await new Promise((resolve) => {
      console.log("Enter the code from that page here: ");
      process.stdin.on("data", (data) => resolve(data.toString().trim()));
    });
    const token = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(token.tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token.tokens));
    console.log("Token stored to", TOKEN_PATH);
  }
  return oAuth2Client;
}

async function writeDataToSheet(auth, data) {
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = GOOGLE_SHEET_ID;
  const range = "Sheet1!A1";

  const values = [
    ["Title", "Price", "Rating", "Link"],
    ...data.map((item) => [item.title, item.price, item.rating, item.link]),
  ];

  const resource = {
    values,
  };

  sheets.spreadsheets.values.update(
    {
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      resource,
    },
    (err, result) => {
      if (err) {
        console.error(err);
      } else {
        console.log(`${result.data.updatedCells} cells updated.`);
      }
    }
  );
}

async function scrapeRakuten() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(
    "https://search.rakuten.co.jp/search/mall/%E3%83%A2%E3%83%AB%E3%82%B8%E3%83%A5%20%E3%83%86%E3%83%B3%E3%83%88%E3%82%B5%E3%82%A6%E3%83%8A/"
  );

  const products = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".searchresultitem")).map(
      (product) => ({
        title: product.querySelector(".title")
          ? product.querySelector(".title").innerText
          : "No Title",
        price: product.querySelector(".price")
          ? product.querySelector(".price").innerText
          : "No Price",
        rating: product.querySelector(".reviewAverage")
          ? product.querySelector(".reviewAverage").innerText
          : "0",
        link: product.querySelector(".title a")
          ? product.querySelector(".title a").href
          : "No Link",
      })
    );
  });

  await browser.close();
  return products;
}

async function scrapeAmazon() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(
    "https://www.amazon.co.jp/s?k=%E3%83%A2%E3%83%AB%E3%82%B8%E3%83%A5+%E3%83%86%E3%83%B3%E3%83%88%E3%82%B5%E3%82%A6%E3%83%8A"
  );

  const products = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".s-result-item")).map(
      (product) => ({
        title: product.querySelector("h2 a span")
          ? product.querySelector("h2 a span").innerText
          : "No Title",
        price: product.querySelector(".a-price-whole")
          ? product.querySelector(".a-price-whole").innerText
          : "No Price",
        rating: product.querySelector(".a-icon-alt")
          ? product.querySelector(".a-icon-alt").innerText.split(" ")[0]
          : "0",
        link: product.querySelector("h2 a")
          ? product.querySelector("h2 a").href
          : "No Link",
      })
    );
  });

  await browser.close();
  return products;
}

(async () => {
  const rakutenProducts = await scrapeRakuten();
  const amazonProducts = await scrapeAmazon();

  const allProducts = [...rakutenProducts, ...amazonProducts];
  const filteredProducts = allProducts.filter(
    (product) => parseFloat(product.rating) >= 4.0
  ); // 評価4以上
  const sortedProducts = filteredProducts.sort((a, b) => {
    const priceA = parseInt(a.price.replace(/[^0-9]/g, ""), 10);
    const priceB = parseInt(b.price.replace(/[^0-9]/g, ""), 10);
    return priceA - priceB;
  });

  const auth = await authorize();
  await writeDataToSheet(auth, sortedProducts);
})();
