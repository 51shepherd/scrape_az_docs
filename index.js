import puppeteer from 'puppeteer';
import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';

'use strict';

async function getRawList() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://azbomprod.azmd.gov/glsuiteweb/clients/azbom/public/webverificationsearch.aspx');

  let [response] = await Promise.all([
    page.waitForNavigation(),
    page.click('#ContentPlaceHolder1_btnSpecial')
  ]);

  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.statusText()} ${response.url()}`);
  }

  const list1 = await page.evaluate(() => {
    return [...document.querySelectorAll('#ContentPlaceHolder1_dtgList a')].map(a => a.href);
  });

  await page.goto('https://azbomprod.azmd.gov/glsuiteweb/clients/azbom/public/webverificationsearch.aspx');
  await page.click('#ContentPlaceHolder1_rbSpecialty2');

  [response] = await Promise.all([
    page.waitForNavigation(),
    page.click('#ContentPlaceHolder1_btnSpecial')
  ]);

  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.statusText()} ${response.url()}`);
  }

  const list2 = await page.evaluate(() => {
    return [...document.querySelectorAll('#ContentPlaceHolder1_dtgList a')].map(a => a.href);
  });

  await browser.close();

  console.log(list1.join('\n'));
  console.log(list2.join('\n'));
}

async function parseAll() {
  const urls = (await readFile('list.csv', { encoding: 'utf8'})).split('\n');
  for (const url of urls.slice(0, 1)) {
    const response = await fetch(url);
    const body = await response.text();
    const { window: { document } } = new JSDOM(body);
    console.log(document);
  }
}

(async() => {
  try {
    await parseAll();
  } catch (ex) {
    console.error(ex);
  }
})();
