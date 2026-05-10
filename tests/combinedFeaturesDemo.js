"use strict";

/**
 * Combined integration demo for:
 * 1. Merkle root + proof validation
 * 2. Fixed block size
 * 3. Difficulty adjustment
 *
 * Run: node tests/combinedFeaturesDemo.js
 * Output transcript: tests/combinedFeaturesDemo-output.txt
 */

const fs = require("fs");
const path = require("path");

const Block = require("../block.js");
const Blockchain = require("../blockchain.js");
const MerkleTree = require("../merkletree.js");
const Transaction = require("../transaction.js");

const OUTPUT_PATH = path.join(__dirname, "combinedFeaturesDemo-output.txt");
const EASY_POW_TARGET = BigInt(
  "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

const lines = [];

function logLine(message = "") {
  console.log(message);
  lines.push(message);
}

function assertPass(name, cond, detail) {
  if (cond) {
    logLine(`PASS: ${name}${detail ? ` -> ${detail}` : ""}`);
  } else {
    logLine(`FAIL: ${name}${detail ? ` -> ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

function makeNet() {
  return {
    register() {},
    broadcast() {},
    sendMessage() {},
  };
}

function mineBlock(block) {
  block.proof = 0;
  while (!block.hasValidProof()) {
    block.proof++;
  }
}

function createSignedTx(client, nonce, outputs, fee = 0) {
  const tx = new Transaction({
    from: client.address,
    nonce,
    pubKey: client.keyPair.public,
    outputs,
    fee,
  });
  tx.sign(client.keyPair.private);
  return tx;
}

function writeTranscript() {
  fs.writeFileSync(OUTPUT_PATH, `${lines.join("\n")}\n`);
}

logLine("Combined feature demo starting...");
logLine("Features under test: Merkle tree, fixed block size, and difficulty adjustment.");
logLine("");

Blockchain.createInstance({
  blockClass: Block,
  transactionClass: Transaction,
  net: makeNet(),
  maxTxsPerBlock: 2,
  clients: [
    { name: "Alice", amount: 500 },
    { name: "Miner", amount: 100, mining: true, miningRounds: 200000 },
  ],
});

const bc = Blockchain.getInstance();
const [alice] = bc.getClients("Alice");
const miner = bc.miners[0];
const rewardAddr = miner.address;

let prev = bc.genesis;
let currentTime = 1_000_000;

logLine(`Configured max transactions per block: ${Blockchain.MAX_TXS_PER_BLOCK}`);
logLine(`Initial difficulty: ${bc.currentDifficulty}`);
logLine("");

const tx1 = createSignedTx(alice, 0, [{ amount: 5, address: rewardAddr }]);
const tx2 = createSignedTx(alice, 1, [{ amount: 7, address: rewardAddr }]);
const tx3 = createSignedTx(alice, 2, [{ amount: 9, address: rewardAddr }]);

const block1 = new Block(rewardAddr, prev, EASY_POW_TARGET);
block1.timestamp = currentTime;

const add1 = block1.addTransaction(tx1);
const add2 = block1.addTransaction(tx2);
const add3 = block1.addTransaction(tx3);

logLine("Block 1 transaction intake:");
logLine(`  tx1 accepted: ${add1}`);
logLine(`  tx2 accepted: ${add2}`);
logLine(`  tx3 accepted after block filled: ${add3}`);
logLine(`  block transaction count: ${block1.transactions.size}`);

assertPass(
  "fixed block size stops overflow transaction",
  add1 && add2 && !add3 && block1.transactions.size === Blockchain.MAX_TXS_PER_BLOCK,
  `accepted=${block1.transactions.size}, cap=${Blockchain.MAX_TXS_PER_BLOCK}`,
);

const includedTxIDs = Array.from(block1.transactions.keys());
const merkleTree = new MerkleTree(includedTxIDs);
const proof = merkleTree.getProof(tx2.id);

logLine("");
logLine("Merkle tree details for block 1:");
logLine(`  included transaction ids: ${includedTxIDs.join(", ")}`);
logLine(`  block merkle root: ${block1.merkleRoot}`);
logLine(`  computed merkle root: ${merkleTree.root}`);
logLine(`  proof length for tx2: ${proof.length}`);

assertPass(
  "block merkle root matches computed root",
  block1.merkleRoot === merkleTree.root,
);
assertPass(
  "merkle proof validates for included tx",
  MerkleTree.verifyProof(tx2.id, proof, block1.merkleRoot),
);

mineBlock(block1);
miner.receiveBlock(block1);
prev = block1;

logLine("");
logLine(`Block 1 mined with proof ${block1.proof}.`);
logLine(`Difficulty after block 1: ${bc.currentDifficulty}`);

const interval = Blockchain.DIFFICULTY_ADJUSTMENT_INTERVAL;
const targetMs = Blockchain.TARGET_BLOCK_TIME_MS;

for (let height = 2; height <= interval; height++) {
  currentTime += 500;
  const block = new Block(rewardAddr, prev, EASY_POW_TARGET);
  block.timestamp = currentTime;
  mineBlock(block);
  miner.receiveBlock(block);
  prev = block;
}

const difficultyAfterFastWindow = bc.currentDifficulty;
logLine("");
logLine(`Difficulty after fast window (${interval} blocks at 500ms spacing): ${difficultyAfterFastWindow}`);

assertPass(
  "difficulty increases after fast blocks",
  difficultyAfterFastWindow > 1,
);

for (let height = 1; height <= interval; height++) {
  currentTime += 4 * targetMs;
  const block = new Block(rewardAddr, prev, EASY_POW_TARGET);
  block.timestamp = currentTime;
  mineBlock(block);
  miner.receiveBlock(block);
  prev = block;
}

const difficultyAfterSlowWindow = bc.currentDifficulty;
logLine(`Difficulty after slow window (${interval} blocks at ${4 * targetMs}ms spacing): ${difficultyAfterSlowWindow}`);

assertPass(
  "difficulty decreases after slow blocks",
  difficultyAfterSlowWindow < difficultyAfterFastWindow,
);

logLine("");
logLine("Combined feature demo complete.");
writeTranscript();
