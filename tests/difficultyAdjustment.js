"use strict";

/**
 * Adjustable PoW difficulty integration checks (manual timestamps).
 * Shresth: This test proves that fast blocks increase difficulty and slow
 * blocks decrease difficulty across the configured adjustment interval.
 * Run: node tests/difficultyAdjustment.js
 */

const Block = require("../block.js");
const Blockchain = require("../blockchain.js");
const Transaction = require("../transaction.js");

const EASY_POW_TARGET = BigInt(
  "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

function mineBlock(b) {
  b.proof = 0;
  while (!b.hasValidProof()) {
    b.proof++;
  }
}

function makeNet() {
  return {
    register() {},
    broadcast() {},
    sendMessage() {},
  };
}

function assertPass(name, cond) {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    console.log(`FAIL: ${name}`);
    process.exitCode = 1;
  }
}

const INTERVAL = Blockchain.DIFFICULTY_ADJUSTMENT_INTERVAL;
const TARGET_MS = Blockchain.TARGET_BLOCK_TIME_MS;

const net = makeNet();
Blockchain.createInstance({
  blockClass: Block,
  transactionClass: Transaction,
  net,
  clients: [{ name: "Miner", amount: 10_000, mining: true, miningRounds: 200_000 }],
});

const bc = Blockchain.getInstance();
const miner = bc.miners[0];
const rewardAddr = miner.address;
const genesis = bc.genesis;

let prev = genesis;
let t = 1_000_000;

// Fast window: INTERVAL blocks with short wall-clock span → difficulty should rise.
// Shresth: These blocks simulate miners finding blocks too quickly.
for (let h = 1; h <= INTERVAL; h++) {
  t += 500;
  const b = new Block(rewardAddr, prev, EASY_POW_TARGET);
  b.timestamp = t;
  mineBlock(b);
  miner.receiveBlock(b);
  prev = b;
}

const difficultyAfterFast = bc.currentDifficulty;
assertPass(
  "difficulty increased after fast window",
  difficultyAfterFast > 1,
);

// Slow window: next INTERVAL blocks with long span → difficulty should fall.
// Shresth: These blocks simulate mining being too slow, so difficulty should relax.
for (let h = 1; h <= INTERVAL; h++) {
  t += 4 * TARGET_MS;
  const b = new Block(rewardAddr, prev, EASY_POW_TARGET);
  b.timestamp = t;
  mineBlock(b);
  miner.receiveBlock(b);
  prev = b;
}

const difficultyAfterSlow = bc.currentDifficulty;
assertPass(
  "difficulty decreased after slow window",
  difficultyAfterSlow < difficultyAfterFast,
);
