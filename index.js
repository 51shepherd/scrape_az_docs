import puppeteer from 'puppeteer';
import { createReadStream, promises } from 'fs';
const { readFile } = promises;
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import { stringify } from 'csv-stringify';
import { parse } from 'csv-parse';
import { promisify } from 'util';
import cla from 'command-line-args';

const options = cla([
  { name: 'offset', type: Number, defaultValue: 0 }
]);

const sleep = promisify(setTimeout);

'use strict';

async function filterList() {
  const interests = [
    'Cardiology (Internal Medicine)',
    'Electrophysiology',
    'Family Medicine',
    'Family Practice',
    'General Practice',
    'Geriatric Medicine (Family Practice)',
    'Geriatric Medicine (Internal Medicine)',
    'Internal Medicine',
    'Medical Oncology (Internal Medicine)',
    'Neurology',
    'Neuromuscular Medicine (Physical Medicine & Rehabilitation)',
    'Oncology (Internal Medicine)',
    'Palliative Medicine',
    'Pulmonary Disease & Critical Care Medicine',
    'Pulmonary Disease (Internal Medicine)',
    'Radiation Oncology (Radiology)',
    'Surgical Oncology',
    'Thoracic and Cardiovascular Surgery (Surgery)',
    'Transplant Surgery'
  ]

  const parser = createReadStream('multi_doctor.csv', { encoding: 'utf8'}).pipe(parse({ columns: true }));

  const stringifier = stringify({
    coluns: [
      { key: 'url' },
      { key: 'name' },
      { key: 'practice' },
      { key: 'address' },
      { key: 'phone' },
      { key: 'school' },
      { key: 'graduation' },
      { key: 'residency' },
      { key: 'interests' },
    ],
    header: true
  });

  stringifier.pipe(process.stdout);

  for await (const record of parser) {
    let found = false;
    for (const interest of record.interests.split('; ')) {
      if (interests.includes(interest) || interests.some(y => (new RegExp('^' + y).test(interest)))) {
        stringifier.write(record);
        found = true;
        break;
      }
    }
  }
}

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
  if (options.offset === 0) {
    console.log(stringify([['url', 'name', 'practice', 'address', 'phone', 'school', 'graduation', 'residency', 'interests']]).trim());
  }

  for (const url of urls.slice(options.offset)) {
    await sleep(2000);
    const response = await fetch(url);
    const body = await response.text();
    const { window: { document } } = new JSDOM(body);
    const entityName = document.querySelector('#ContentPlaceHolder1_dtgGeneral_lblLeftColumnEntName_0').textContent.trim();
    const parts = [...document.querySelector('#ContentPlaceHolder1_dtgGeneral_lblLeftColumnPracAddr_0').childNodes].filter(e => e.nodeName === '#text').map(e => e.textContent.trim());
    const matches = parts.pop().match(/Phone:(.*)/);
    let phone = matches ? matches[1].trim() : undefined;
    let practiceAddress, practiceName;
    if (parts.length > 0) {
      if (parts[0].match(/\d/)) {
        // no practice name
        practiceAddress = parts.join(', ')
      } else {
        practiceName = parts[0];
        practiceAddress = parts.slice(1).join(', ');
      }
    }

    // const matches = document.querySelector('#ContentPlaceHolder1_dtgGeneral tr td:nth-child(2)').textContent.match(/License Number: (\d+)/);
    // const licenseNumber = matches ? matches[1] : undefined;
    const table = document.querySelector('#ContentPlaceHolder1_dtgEducation');
    let medicalSchool, graduation, residency, interestAreas=[];
    if (table) {
      [...table.querySelectorAll('tr')].forEach(row => {
        if (/Medical School/.test(row.children[1].textContent)) {
          const matches = childrenToString(row.children[2].childNodes).match(/(.+), ([^,]+)$/);
          if (matches) {
            [, medicalSchool, graduation] = matches;
          }
        } else if (/Residency/.test(row.children[1].textContent)) {
          residency = childrenToString(row.children[2].childNodes);
        } else if (/Area of Interest/.test(row.children[1].textContent)) {
          interestAreas.push(row.children[2].textContent.trim());
        }
      });
    }

    // console.log({
    //   url, entityName, practiceName, practiceAddress, phone, medicalSchool, graduation, residency, interestAreas: interestAreas.join('; ')
    // });

    console.log(stringify([[url, entityName, practiceName, practiceAddress, phone, medicalSchool, graduation, residency, interestAreas.join('; ')]]).trim());
  }
}

(async() => {
  try {
    await filterList();
  } catch (ex) {
    console.error(ex);
  }
})();
