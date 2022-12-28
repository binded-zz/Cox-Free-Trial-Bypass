const puppeteer = require("puppeteer");
const sh = require("shelljs");
const random_name = require("node-random-name");
const random_useragent = require("random-useragent");
const fs = require("fs");
const path = require("path");
const randomMac = require("random-mac");
const notifier = require("node-notifier");
const util = require("util");
const dns = require("dns");
const wifi = require("node-wifi");
const argv = require("yargs")
  .option("iface", {
    alias: "i",
    describe: "Interfaceto use",
    demandOption: true,
  })
  .option("debug", {
    alias: "d",
    type: "boolean",
    description: "Run with debug output",
  })
  .option("agent", {
    alias: "a",
    type: "boolean",
    description: "Run with usere-agent output",
  })
  .option("notify", {
    alias: "n",
    type: "boolean",
    description: "Run with system graphic notice",
  })
  .option("pagetext", {
    alias: "p",
    type: "boolean",
    description: "Run with page text output",
  })
  .option("screenshots", {
    alias: "s",
    type: "boolean",
    description: "Run with screen shots of web site",
  })
  .option("timeout", {
    alias: "t",
    default: 60000,
    description: "Time to wait for page loads",
  }).argv;

  const cmd = `
  sudo systemctl stop NetworkManager.service && \
  sudo ifconfig "${argv.iface}" down && \
  sudo macchanger -a "${argv.iface}" && \
  sudo ifconfig "${argv.iface}" up && \
  sudo systemctl start NetworkManager.service && \
  sleep 3
`;

async function isConnected() {
  try {
    let lookupService = util.promisify(dns.lookupService);
    let result = await lookupService("8.8.8.8", 53);
    return true;
  } catch (err) {
    return false;
  }
}

function waitTillOnline() {
  var tried = 0;
  var check = async function (cb) {
    let isReallyConnected = await isConnected();

    if (tried < 30 && !isReallyConnected) {
      ++tried;
      process.stdout.write(`${tried}\r`);
      setTimeout(check.bind(this, cb), 1000);
    } else if (tried >= 30) {
      console.log("[DEBUG] Waited over a min, attempting to continue anyways");
      cb();
    } else {
      cb();
    }
  };

  if (argv.debug) {
    console.log("[DEBUG] Waiting till online...");
  }
  return new Promise(function (resolve, reject) {
    check(function () {
      resolve();
    });
  });
}

const rand = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const domains = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "live.com",
  "aol.com",
];

const emailMixer = (firstName, lastName) => {
  let first = rand(0, 1)
    ? firstName + "." + lastName
    : lastName + "." + firstName;

  return `${first}@${domains[Math.floor(Math.random() * domains.length)]}`;
};

(async function run() {
  const name = random_name();
  const firstName = name.split(" ")[0];
  const lastName = name.split(" ")[1];

  const agent = random_useragent.getRandom(function (ua) {
    return !ua.userAgent.includes("Mobile") && ua.userAgent.includes("Windows");
  });

  const args = [
    "--user-agent=" + agent,
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-infobars",
    "--window-position=0,0",
    "--ignore-certifcate-errors",
    "--ignore-certifcate-errors-spki-list",
  ];

  const options = {
    args,
    headless: true,
    ignoreHTTPSErrors: true,
  };

  sh.exec(cmd, async (code, output) => {
      if (argv.notify) {
      notifier.notify({
      icon: path.join(__dirname, "wifi.png"),
      title: "Cox Wifi Connecting...",
      message: "Attempting to connect to Cox Wifi.",
    });
    }
    
    await waitTillOnline();

    if (argv.debug) {
      console.log("[DEBUG] Online! Continuing...");
    }

    var macParts = output.match(/(?<=New MAC:       \s*).*?(?=\s* )/gs);

    const mac = macParts[0];

    const browser = await puppeteer.launch(options);

    const context = await browser.createIncognitoBrowserContext();

    const page = await context.newPage();

    try {
      page.on("error", (msg) => {
        throw msg;
      });

      const preloadFile = fs.readFileSync("./preload.js", "utf8");
      await page.evaluateOnNewDocument(preloadFile);

      await page.goto(
        `http://cwifi-new.cox.com/?mac-address=${mac}&ap-mac=${randomMac()}&ssid=CoxWiFi&vlan=103&nas-id=BTNRWAGB01.at.at.cox.net&block=false&unique=$HASH`,
        {
          waitUntil: "networkidle2",
          timeout: 60000,
        }
      );

      if (argv.screenshots) {
        await page.screenshot({
          path: path.resolve(__dirname) + "/landing.jpeg",
          type: "jpeg",
          quality: 100,
        });

        console.log(
          "[DEBUG]: Landing page screenshot: ",
          path.resolve(__dirname) + "/landing.jpeg"
        );
      }

      await page.waitForSelector(
        "#signIn > .signInText > .freeAccessPassSignup > .floatleft > .coxRegisterButton"
      );
      await page.keyboard.down("Tab");
      await page.keyboard.down("Tab");
      await page.keyboard.press("Enter");

      await page.waitForNavigation({ timeout: argv.timeout });

      var userAgent = await page.evaluate(() => {
        return (function () {
          return window.navigator.userAgent;
        })();
      });

      if (argv.agent) {
        console.log("Using usere-agent:", userAgent);
      }

      await page.setViewport({ width: 1440, height: 779 });

      await page.waitForSelector("table #trial_request_voucher_form_firstName");
      await page.click("table #trial_request_voucher_form_firstName");

      await page.type(
        "table #trial_request_voucher_form_firstName",
        firstName,
        {
          delay: rand(100, 200),
        }
      );

      await page.type("table #trial_request_voucher_form_lastName", lastName, {
        delay: rand(100, 200),
      });

      await page.waitForSelector("table #trial_request_voucher_form_isp");
      await page.click("table #trial_request_voucher_form_isp");

      await page.select("table #trial_request_voucher_form_isp", "Verizon");

      await page.waitForSelector("table #trial_request_voucher_form_email");
      await page.click("table #trial_request_voucher_form_email");

      await page.type(
        "table #trial_request_voucher_form_email",
        emailMixer(firstName, lastName),
        {
          delay: rand(100, 200),
        }
      );

      await page.waitForSelector(
        ".decisionBlock > table > tbody > tr > .top:nth-child(2)"
      );
      await page.click(
        ".decisionBlock > table > tbody > tr > .top:nth-child(2)"
      );

      await page.waitForSelector(
        "table #trial_request_voucher_form_serviceTerms"
      );
      await page.click("table #trial_request_voucher_form_serviceTerms");

      await page.keyboard.down("Tab");
      await page.keyboard.down("Tab");
      await page.keyboard.press("Enter");

      await page.waitForNavigation({ timeout: argv.timeout });

      var pageText = await page.evaluate(() => {
        return (function () {
          var s = window.getSelection();
          s.removeAllRanges();
          var r = document.createRange();
          r.selectNode(document.body);
          s.addRange(r);
          var c = s.toString();
          s.removeAllRanges();
          return c;
        })();
      });

      if (argv.pagetext) {
        console.log("[DEBUG]: pageText:", pageText);
      }

      if (pageText.toLowerCase().includes("you are now connected")) {
        let t = new Date().toLocaleString();

        if (argv.notify) {
          notifier.notify({
          icon: path.join(__dirname, "wifi.png"),
          title: "Cox Wifi Connected",
          message: "Wifi Connected Successfully",
        });
        }

        console.log("Wifi Connected Successfully", t \n);

        if (argv.screenshots) {
          await page.screenshot({
            path: path.resolve(__dirname) + "/result.jpeg",
            type: "jpeg",
            quality: 100,
          });
          console.log(
            "[DEBUG]: Result page screenshot: ",
            path.resolve(__dirname) + "/result.jpeg"
          );
        }

        setTimeout(run, 60000 * 60);
      } else {
        await page.screenshot({
          path: path.resolve(__dirname) + "/error-result.jpeg",
          type: "jpeg",
          quality: 100,
        });

        console.log(
          "[DEBUG]: Error screenshot: ",
          path.resolve(__dirname) + "/error-result.jpeg"
        );

        if (argv.notify) {
          notifier.notify({
          icon: path.join(__dirname, "error.png"),
          title: "Error",
          message: "Error, Cox Wifi failed to connect, please check output.",
        });
        }
      }

      await browser.close();
    } catch (err) {
      console.warn("Error: ", err);
      setTimeout(run, 30000);
    }
  });
})();
