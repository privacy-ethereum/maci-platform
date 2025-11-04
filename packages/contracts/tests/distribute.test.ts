import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import hre from "hardhat";
import { getSigners, deployContract } from "maci-contracts";

import fs from "fs";
import path from "path";

import type { Signer } from "ethers";

import { ERC20 } from "../typechain-types";

chai.use(chaiAsPromised);

const { expect } = chai;

describe("distribute", () => {
  let payoutToken: ERC20;
  let owner: Signer;
  let projects: Signer[];
  let tokenAddress: string;
  let payoutAddresses: string[];

  const testDataDir = path.resolve(__dirname, "./data");
  const projectsFile = path.resolve(__dirname, "./data/projects.json");
  const amountsFile = path.resolve(__dirname, "./data/amounts.json");

  before(async () => {
    [owner, ...projects] = await getSigners();

    payoutToken = await deployContract("MockERC20", owner, true, "Payout token", "PT");
    tokenAddress = await payoutToken.getAddress();
    payoutAddresses = await Promise.all(projects.map((project) => project.getAddress()));

    await fs.promises.mkdir(testDataDir);
  });

  after(async () => {
    await fs.promises.rmdir(testDataDir);
  });

  afterEach(async () => {
    await Promise.all([fs.promises.rm(projectsFile), fs.promises.rm(amountsFile)]);
  });

  it("should throw an error if provided project data is invalid", async () => {
    await fs.promises.writeFile(projectsFile, JSON.stringify([{ recipientIndex: "index", payoutAddress: "address" }]));
    await fs.promises.writeFile(amountsFile, JSON.stringify([0]));

    await expect(hre.run("distribute", { projectsFile, amountsFile, tokenAddress })).to.be.rejectedWith(
      JSON.stringify(
        [
          {
            code: "invalid_type",
            expected: "number",
            received: "nan",
            path: [0, "recipientIndex"],
            message: "Expected number, received nan",
          },
          {
            code: "custom",
            message: "Invalid Address",
            path: [0, "payoutAddress"],
          },
        ],
        undefined,
        2,
      ),
    );
  });

  it("should throw an error if provided amount data is invalid", async () => {
    await fs.promises.writeFile(
      projectsFile,
      JSON.stringify([{ recipientIndex: "0", payoutAddress: payoutAddresses[0] }]),
    );
    await fs.promises.writeFile(amountsFile, JSON.stringify(["invalid"]));

    await expect(hre.run("distribute", { projectsFile, amountsFile, tokenAddress })).to.be.rejectedWith(
      JSON.stringify(
        [
          {
            code: "invalid_type",
            expected: "bigint",
            received: "string",
            path: [0],
            message: "Expected bigint, received string",
          },
        ],
        undefined,
        2,
      ),
    );
  });

  it("should throw an error if provided token address is invalid", async () => {
    await fs.promises.writeFile(
      projectsFile,
      JSON.stringify([{ recipientIndex: "0", payoutAddress: payoutAddresses[0] }]),
    );
    await fs.promises.writeFile(amountsFile, JSON.stringify(["1"]));

    await expect(hre.run("distribute", { projectsFile, amountsFile, tokenAddress: "invalid" })).to.be.rejectedWith(
      JSON.stringify(
        [
          {
            code: "custom",
            message: "Invalid Address",
            path: [],
          },
        ],
        undefined,
        2,
      ),
    );
  });

  it("should throw an error if projects and amounts length are not matched", async () => {
    await fs.promises.writeFile(
      projectsFile,
      JSON.stringify([{ recipientIndex: "0", payoutAddress: payoutAddresses[0] }]),
    );
    await fs.promises.writeFile(amountsFile, JSON.stringify(["1", "2"]));

    await expect(hre.run("distribute", { projectsFile, amountsFile, tokenAddress })).to.be.rejectedWith(
      "Projects and amounts arrays must be the same length",
    );
  });

  it("should throw an error if there is no enough balance", async () => {
    const amount = await payoutToken.balanceOf(owner).then((balance) => balance + 1n);
    await fs.promises.writeFile(
      projectsFile,
      JSON.stringify([{ recipientIndex: "0", payoutAddress: payoutAddresses[0] }]),
    );
    await fs.promises.writeFile(amountsFile, JSON.stringify([amount.toString()]));

    await expect(hre.run("distribute", { projectsFile, amountsFile, tokenAddress })).to.be.rejectedWith(
      "Not enough balance",
    );
  });

  it("should transfer funds properly", async () => {
    const addresses = [
      "0x78459f5964779359b0452b44aa68831db20b59fc",
      "0x364d11a2c51f235063b7db5b60957ae2ea91acee",
      "0x91836f34a46a4b804744010ec81bf6648fef4a25",
      "0xb9800f0c6f6daea52f8efe215134f066fd2e3598",
      "0x9531c059098e3d194ff87febb587ab07b30b1306",
      "0x00f16ec63017b2268bc5513abaf841b58095104c",
      "0x07882614aaf91cd0d04ee401d9a9224579625c18",
      "0x26938b1a8f0b70e78a9fe03810eddeb03e4d1fe3",
      "0x6a5f74b8ce7cfa3ec40056155b87f8b983768390",
      "0x8dc77b145d7009752d6947b3cf6d983cafa1c0bb",
      "0xd0d5de463e8082b7947e3ce2178c3b2e5137aa6a",
      "0x155d27c2107734483d24bb2e365e188a7e1331a7",
      "0xc29b8ab20f59623fa15564470eb22f16433eb0b7",
      "0x2cd06e2f0c1b0cf08d9db9356562ff508c9e16b3",
      "0xc2fb4b3ea53e10c88d193e709a81c4dc7aec902e",
      "0x5c77d5b01c3cc02d7fea8901caf3803fb191da16",
      "0x883660510c0b25862c67784fe2963860f6193def",
      "0x2eece69698d467b77d1374372dfe5b89b70dd259",
      "0x8d70d88053909c80d2274f8212b7cee6b0641311",
      "0xddc0ba8a8888f55b6ae27b4dba62d838fbe27a69",
      "0xadad53d27fb1ad8f808e1b44834e14da34b75bda",
      "0x708828a29fa113e901d0ebd30c4b64fef7374b66",
      "0x4868c60e35373b8cad0a26343d74b51e8331bddb",
      "0x3b465d0695621f330a45bcc15fcf6b2d8f2046d6",
      "0xf48514aef1d0b72d4d913fcc95fe14aba199dd54",
      "0xea96b32c78afbd1b01c3346f2c42cc2d89655b8d",
      "0x251e4707865feba92094d3918dcdaceda3c389ba",
      "0x8147cf7f76d018f9f84b7dbbcb73dea10705db16",
      "0xba52ae95e21daefbc2ffa37e641a8b4961209568",
      "0x796cdacbe14440136765ad5562c63f02b4eb38b5",
      "0x36f322fc85b24ab13263cfe9217b28f8e2b38381",
      "0xdfaf06fdc7aceb1086a4ab72e4e21cb97ef98dc8",
      "0xd4f6dc3ac7afd370544f307f4a53d6f77ed4e818",
      "0x1a9867411eeda4af37a4e19f02760e7c8bf555b8",
      "0x22313fbc6e7230962a939205c37154cea44ade62",
      "0xd444ac8f8b5680a5b655cf29d4114f3f2d417abc",
      "0x222a7aa6d4f7ba245ef26b5bcd047bdef8163fdb",
      "0xadea33469fca95164be08aad4dff7fd457cd0d4d",
      "0xadea33469fca95164be08aad4dff7fd457cd0d4d",
      "0x08728267cffee50a06c1adbac862852a62b885ab",
      "0xadabc3a68a7e6e8ec9beaeb0b6ccfb6e9c374f02",
      "0x2217400dbbbbf5b1377472c5cf1dd3d58b3ec9d9",
      "0x3656dae6c6040d5930250a9792d6830ba2e1a470",
      "0x5af68580b9ccb5a3b147c09946454696f7c30e4c",
      "0xf2f03516e4bf21dadffc69a4c8e858497fe4edbc",
      "0x36d540551d14202ad62bbb4e52b642fbc4006373",
      "0xbe76b786e4d9a6039b9e9f188e0ee0a955cae5c8",
      "0x2a438a3f0998b82a25b5c05f8975a446b2ee28d8",
      "0xbdc3f1a02e56cd349d10ba8d2b038f774ae22731",
      "0x35340673e33ef796b9a2d00db8b6a549205aabe4",
      "0xb941c7aad899b5f7a575a566c85f5132c8a9e4aa",
      "0xe34add59d0d599228e2f153793f0b33ea042eeb3",
      "0x8f05cbae239faddaaec9b2b73acefb12756e5b0f",
      "0xa82868b656ce25571a0313661aec42892a6acddd",
      "0x4b994361257d060cf20dab2f13286b16b0019fde",
      "0x40e0b656d94cd0a01a3978897d14dea5831810a0",
      "0xfb91da2035723982a3b61279357c070f6359b029",
      "0x74d8967e812de34702ecd3d453a44bf37440b10b",
      "0xe9c265c726cef84ff60c4a40e7d68ef425d7a76b",
      "0x35292bbd442373046a6fb4bf7e2529fa9a8d5bb0",
      "0x20e229667cec8a0e9d3c6fb89693b2a44ec2c50e",
      "0xf719aa02d048a591b11a2df2befb311f0b6d035e",
      "0x4eed6f203c6360d4fa3c92fd480c897b3fa11c64",
      "0x643f281f6d356b9d29c9ff2787cec97d119a6283",
      "0x6e6557458e7861161db728f0b4d9c69b1289e1bf",
      "0xdc240918fdc867ffd4b43187cb02cf05cb2a6081",
      "0x80bd9086bc803140ed7fc738db3ee1441101f506",
      "0x63d8df33070ab795642cff60d0d87e9ebb490314",
      "0x20231a0c6695f56d9ce86ce2b0abd120e93f8afe",
      "0x576edced7475d8f64a5e2d5227c93ca57d7f5d20",
      "0xf2a75ca947d1fd7cc79aa6374915189259d3bfd5",
      "0xa904a88ac3f7f202fe444303ec93f57d871fe48a",
      "0xa2a8032def98116c90b278aa9f517b7b4786287b",
      "0x547202fb75d77ccadf836a02ec68f2b955202c3a",
      "0xdea74efcf345893fe1578589218e9cb6bd446d2d",
      "0xb476ee7d610dae7b23b671ebc7bd6112e9772969",
      "0x59d4a6dcf46955cb4be03f2239636a98a7f87de4",
      "0x96373d84487e69aa10ef3e8d2ece28ca27b50add",
      "0xe80710498b1584da47d19e0dcad7f3ed8c74a6e4",
      "0xb11da387a47b6f52da11a45269d684c1f903c131",
      "0x86e67a05324a55af6b2b3bf1a5cba1778c56a8be",
      "0x96cd565aaab2e55ffe4bb9bf64cd234a96c7ff45",
      "0xe50110d15891d0773fdff5328533ee173ad313e8",
      "0x64ccd150998baba36985726e7dd83871ad668fd0",
      "0x1b7fe2cb154ce1c5a7a4760e9be3f9deffd59c8b",
      "0xf5ac0b87325bf1b3eee525eb9646fafd69d2fedc",
      "0x11eb9555d929c980e85ce7609016d6c117a41a37",
      "0x20e229667cec8a0e9d3c6fb89693b2a44ec2c50e",
      "0x1f512addf482b8a3fced3c3ad04991b37b2ac5ae",
      "0xd1b8db70ded72db850713b2ce7e1a4ffafad95d1",
      "0x7f2419837012518ca4f8cfad1876aca0cf549aa9",
      "0xbe5d4567004c4838f6899a3cb46151264fa60f6b",
      "0xe3d34dac159f88fd2cd38b1380b998000a9c0880",
    ];

    const amounts = [
      "42782690807119449",
      "11322104472406366",
      "3230503243874888",
      "783923480110196504",
      "667457530678794651",
      "36713221133699060",
      "55638112305918232",
      "3404485911955002",
      "30994791804526022",
      "4122632122301394711",
      "2453255105732922",
      "2793857447332777",
      "369686728898989527",
      "45439077314577435",
      "483744510925810277",
      "96107769429609238",
      "366653813529858520",
      "7236413877251652",
      "26314736237913385",
      "19162087064316402",
      "12311384510877329",
      "140092399945782615",
      "556507831470752175",
      "31194544953567432",
      "6823394568434214",
      "1712623336631482260",
      "18756127505462804",
      "7352402322638394",
      "47502333110024531",
      "705025029429983944",
      "543043946781628698",
      "16784627178484715",
      "38772492187269439",
      "68529439043729273",
      "93498029408407536",
      "24772821957513569",
      "14057664452449242",
      "12137401842797216",
      "137064703577975355",
      "11148121804326253",
      "71371783725958427",
      "9747663205677944",
      "40926875680931572",
      "13169343625647748",
      "181203068527187826",
      "26381024470017626",
      "1480238560426260",
      "941674362754619308",
      "295845123329537345",
      "9220496200113857",
      "2967840115412891",
      "13534178944165340",
      "6359440786887244",
      "494450140162016704",
      "4333930979092502",
      "133734475381878027",
      "349274539416380257",
      "582352181947408719",
      "83464076586542921",
      "467671428861495445",
      "7455505527544487",
      "237129896406064979",
      "13824150057632195",
      "378996166241959989",
      "177385542025354481",
      "434457545397368421",
      "29338729827379555",
      "191438918491330475",
      "1712215451199745",
      "333484368715568441",
      "26323030247324254",
      "4190427581440554646",
      "1369772360959796",
      "25008783590163769",
      "120866796412852563",
      "210801365193881350",
      "374681919570837254",
      "14348869825363127",
      "54463198618333536",
      "9863651651064687",
      "11888858214262898",
      "11438092917793109",
      "10370873666184285",
      "33435161669778294",
      "1065378502968730",
      "8930525086647001",
      "3172509021181517",
      "22579154972155522",
      "3114514798488146",
      "440143469021273760",
      "22057206967915181",
      "48894194454665438",
      "380793987145454495",
    ];

    const totalAmount = amounts.reduce((acc, amount) => acc + BigInt(amount), 0n);

    await fs.promises.writeFile(
      projectsFile,
      JSON.stringify(
        addresses.map((payoutAddress, recipientIndex) => ({
          recipientIndex,
          payoutAddress,
        })),
      ),
    );
    await fs.promises.writeFile(amountsFile, JSON.stringify(amounts));

    const initialBalance = await payoutToken.balanceOf(owner);
    const initialBalances = await Promise.all(addresses.map((address) => payoutToken.balanceOf(address)));

    await hre.run("distribute", { projectsFile, amountsFile, tokenAddress });

    const finalBalance = await payoutToken.balanceOf(owner);
    const finalBalances = await Promise.all(
      Array.from(new Set(addresses)).map((address) => payoutToken.balanceOf(address)),
    );

    const combinedBalances = amounts.reduce((acc, amount, index) => acc + BigInt(amount) + initialBalances[index], 0n);
    const totalFinalBalance = finalBalances.reduce((acc, balance) => acc + balance, 0n);

    expect(totalFinalBalance).to.eq(totalAmount);
    expect(combinedBalances).to.eq(totalAmount);
    expect(initialBalance - totalAmount).to.eq(finalBalance);
  });
});
