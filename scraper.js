import { chromium } from "playwright";

//ブラウザが立ち上がる
const browser = await chromium.launch({headless:false});

//新しいページを立ち上げる
const page = await browser.newPage();

//どこのページに遷移するか
await page.goto("https://swan-room.com/");

//ページのHTML要素が取れてくる
const htmlStr = await page.content();

console.log(htmlStr);

//ブラウザを閉じる
await browser.close();