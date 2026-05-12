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
const FakeNet = require("../fake-net.js");
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

class SyncNet extends FakeNet {
  sendMessage(address, msg, o) {
    const client = this.clients.get(address);
    const payload = JSON.parse(JSON.stringify(o));
    client.emit(msg, payload);
  }
}

function mineBlock(block) {
  block.proof = 0;
  while (!block.hasValidProof()) {
    block.proof++;
  }
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
  net: new SyncNet(),
  maxTxsPerBlock: 2,
  clients: [
    { name: "Alice", amount: 500 },
    { name: "Bob", amount: 150 },
    { name: "Charlie", amount: 75 },
    { name: "Miner", amount: 100, mining: true, miningRounds: 200000 },
  ],
});

const bc = Blockchain.getInstance();
const [alice, bob, charlie] = bc.getClients("Alice", "Bob", "Charlie");
const miner = bc.miners[0];
const rewardAddr = miner.address;

let prev = bc.genesis;
let currentTime = 1_000_000;

logLine(`Configured max transactions per block: ${Blockchain.MAX_TXS_PER_BLOCK}`);
logLine(`Initial difficulty: ${bc.currentDifficulty}`);
logLine("");

miner.on(Blockchain.POST_TRANSACTION, miner.addTransaction);

const tx1 = alice.postTransaction([{ amount: 5, address: bob.address }], 0);
const tx2 = alice.postTransaction([{ amount: 7, address: charlie.address }], 0);
const tx3 = charlie.postTransaction([{ amount: 40, address: alice.address }], 0);

miner.startNewSearch();
const block1 = miner.currentBlock;
block1.target = EASY_POW_TARGET;
block1.timestamp = currentTime;

const queuedOverflow = miner.transactions.size;
const overflowHasTx = (tx) => Array.from(miner.transactions).some((queuedTx) => queuedTx.id === tx.id);

logLine("Block 1 transaction intake:");
logLine(`  Alice -> Bob tx status: ${overflowHasTx(tx1) ? "overflowed" : block1.transactions.has(tx1.id)}`);
logLine(`  Alice -> Charlie tx status: ${overflowHasTx(tx2) ? "overflowed" : block1.transactions.has(tx2.id)}`);
logLine(`  Alice -> Miner tx status: ${overflowHasTx(tx3) ? "overflowed" : block1.transactions.has(tx3.id)}`);
logLine(`  block transaction count: ${block1.transactions.size}`);
logLine(`  queued overflow transactions for next block: ${queuedOverflow}`);

assertPass(
  "fixed block size stops overflow transaction",
  block1.transactions.size === Blockchain.MAX_TXS_PER_BLOCK && queuedOverflow === 1,
  `accepted=${block1.transactions.size}, overflow=${queuedOverflow}, cap=${Blockchain.MAX_TXS_PER_BLOCK}`,
);

const includedTxIDs = Array.from(block1.transactions.keys());
const merkleTree = new MerkleTree(includedTxIDs);
const proofTx = block1.transactions.has(tx2.id) ? tx2 : tx1;
const proof = merkleTree.getProof(proofTx.id);

logLine("");
logLine("Merkle tree details for block 1:");
logLine(`  included transaction ids: ${includedTxIDs.join(", ")}`);
logLine(`  block merkle root: ${block1.merkleRoot}`);
logLine(`  computed merkle root: ${merkleTree.root}`);
logLine(`  proof length for verified tx: ${proof.length}`);

assertPass(
  "block merkle root matches computed root",
  block1.merkleRoot === merkleTree.root,
);
assertPass(
  "merkle proof validates for included tx",
  MerkleTree.verifyProof(proofTx.id, proof, block1.merkleRoot),
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
