import puppeteer from 'puppeteer';
import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import { stringify } from 'csv-stringify/sync';

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

function childrenToString(children, delimiter=', ') {
  return [...children].filter(e => e.nodeName === '#text').map(e => e.textContent.trim()).join(delimiter);
}

async function parseAll() {
  const urls = (await readFile('list.csv', { encoding: 'utf8'})).split('\n');
  console.log(stringify([['url', 'name', 'practice', 'school', 'graduation', 'residency', 'interests']]).trim());

  for (const url of urls.slice(1, 21)) {
    const response = await fetch(url);
    const body = await response.text();
    const { window: { document } } = new JSDOM(body);
    const entityName = document.querySelector('#ContentPlaceHolder1_dtgGeneral_lblLeftColumnEntName_0').textContent.trim();
    const practiceAddress = childrenToString(document.querySelector('#ContentPlaceHolder1_dtgGeneral_lblLeftColumnPracAddr_0').childNodes);

    const [, licenseNumber] = document.querySelector('#ContentPlaceHolder1_dtgGeneral tr td:nth-child(2)').textContent.match(/License Number: (\d+)/);
    const table = document.querySelector('#ContentPlaceHolder1_dtgEducation');
    let medicalSchool, graduation, residency, interestAreas=[];
    [...table.querySelectorAll('tr')].forEach(row => {
      if (/Medical School/.test(row.children[1].textContent)) {
        [, medicalSchool, graduation] = childrenToString(row.children[2].childNodes).match(/(.+), ([^,]+)$/);
      } else if (/Residency/.test(row.children[1].textContent)) {
        residency = childrenToString(row.children[2].childNodes);
      } else if (/Area of Interest/.test(row.children[1].textContent)) {
        interestAreas.push(row.children[2].textContent.trim());
      }
    });

    console.log(stringify([[url, entityName, practiceAddress, medicalSchool, graduation, residency, interestAreas.join('; ')]]).trim());
  }
}

(async() => {
  try {
    await parseAll();
  } catch (ex) {
    console.error(ex);
  }
})();
