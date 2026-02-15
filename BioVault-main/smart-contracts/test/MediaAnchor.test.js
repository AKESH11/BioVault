const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("MediaAnchor Contract", function () {
  let mediaAnchor;
  let owner, user1, user2, user3;
  
  const sampleMediaHash = "0x1234567890abcdef";
  const sampleBioSignature = "BPM:72|SIG:abc123";
  const sampleHardwareID = "PRNU:device123";
  const sampleIPFSHash = "QmTest123";
  const samplePoRHash = "por_hash_abc";
  const samplePoRIPFS = "QmPoRTest456";
  const sampleAllUnique = true;
  const sampleDetectedFaces = 1;

  // Helper: anchor with all 9 params
  async function anchorFull(signer, hash, parties) {
    return mediaAnchor.connect(signer).anchorMedia(
      hash,
      sampleBioSignature,
      sampleHardwareID,
      parties,
      sampleIPFSHash,
      samplePoRHash,
      samplePoRIPFS,
      sampleAllUnique,
      sampleDetectedFaces
    );
  }

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();
    
    const MediaAnchor = await ethers.getContractFactory("MediaAnchor");
    mediaAnchor = await MediaAnchor.deploy();
    await mediaAnchor.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await mediaAnchor.owner()).to.equal(owner.address);
    });
  });

  describe("Media Anchoring", function () {
    it("Should anchor media with valid data", async function () {
      const consensusParties = [user1.address, user2.address];
      
      await expect(anchorFull(owner, sampleMediaHash, consensusParties))
        .to.emit(mediaAnchor, "MediaAnchored")
        .withArgs(
          anyValue,        // mediaHash (indexed string — hashed)
          owner.address,
          anyValue,        // timestamp
          sampleHardwareID,
          sampleAllUnique,
          sampleDetectedFaces
        );
    });

    it("Should anchor with Proof of Reality fields", async function () {
      await anchorFull(owner, sampleMediaHash, [user1.address]);
      const record = await mediaAnchor.getMediaRecord(sampleMediaHash);

      expect(record.proofOfRealityHash).to.equal(samplePoRHash);
      expect(record.proofOfRealityIPFS).to.equal(samplePoRIPFS);
      expect(record.allUniqueSignals).to.equal(true);
      expect(record.detectedFaces).to.equal(1);
    });

    it("Should fail with empty media hash", async function () {
      await expect(
        mediaAnchor.anchorMedia(
          "", sampleBioSignature, sampleHardwareID, [user1.address],
          sampleIPFSHash, samplePoRHash, samplePoRIPFS, true, 1
        )
      ).to.be.revertedWith("Media hash cannot be empty");
    });

    it("Should auto-include creator when no consensus parties provided", async function () {
      // Solo recording: empty consensusParties => contract auto-adds msg.sender
      await mediaAnchor.anchorMedia(
        sampleMediaHash, sampleBioSignature, sampleHardwareID, [],
        sampleIPFSHash, samplePoRHash, samplePoRIPFS, true, 1
      );
      const record = await mediaAnchor.getMediaRecord(sampleMediaHash);
      expect(record.consensusParties.length).to.equal(1);
      expect(record.consensusParties[0]).to.equal(owner.address);
      expect(await mediaAnchor.hasConsent(sampleMediaHash, owner.address)).to.be.true;
    });

    it("Should fail when anchoring duplicate hash", async function () {
      await anchorFull(owner, sampleMediaHash, [user1.address]);

      await expect(
        anchorFull(owner, sampleMediaHash, [user1.address])
      ).to.be.revertedWith("Media already anchored");
    });
  });

  describe("Media Verification", function () {
    beforeEach(async function () {
      await anchorFull(owner, sampleMediaHash, [user1.address, user2.address]);
    });

    it("Should verify existing media", async function () {
      const [exists, isValid, timestamp] = await mediaAnchor.verifyMedia(sampleMediaHash);
      
      expect(exists).to.be.true;
      expect(isValid).to.be.true;
      expect(timestamp).to.be.gt(0);
    });

    it("Should return false for non-existent media", async function () {
      const [exists, isValid] = await mediaAnchor.verifyMedia("0xnonexistent");
      
      expect(exists).to.be.false;
      expect(isValid).to.be.false;
    });
  });

  describe("Consent Tracking", function () {
    it("Should track all consensus parties", async function () {
      await anchorFull(owner, sampleMediaHash, [user1.address, user2.address]);

      expect(await mediaAnchor.hasConsent(sampleMediaHash, user1.address)).to.be.true;
      expect(await mediaAnchor.hasConsent(sampleMediaHash, user2.address)).to.be.true;
      expect(await mediaAnchor.hasConsent(sampleMediaHash, user3.address)).to.be.false;
    });
  });

  describe("Disputes", function () {
    beforeEach(async function () {
      await anchorFull(owner, sampleMediaHash, [user1.address]);
    });

    it("Should allow anyone to dispute media", async function () {
      await expect(
        mediaAnchor.connect(user3).disputeMedia(sampleMediaHash, "Fake video")
      )
        .to.emit(mediaAnchor, "MediaDisputed")
        .withArgs(anyValue, user3.address, "Fake video", anyValue);
    });

    it("Should track disputes", async function () {
      await mediaAnchor.connect(user3).disputeMedia(sampleMediaHash, "Fake video");
      
      const disputes = await mediaAnchor.getDisputes(sampleMediaHash);
      expect(disputes.length).to.equal(1);
      expect(disputes[0].disputer).to.equal(user3.address);
      expect(disputes[0].reason).to.equal("Fake video");
    });
  });

  describe("Revocation", function () {
    beforeEach(async function () {
      await anchorFull(owner, sampleMediaHash, [user1.address]);
    });

    it("Should allow creator to revoke", async function () {
      await expect(mediaAnchor.connect(owner).revokeMedia(sampleMediaHash))
        .to.emit(mediaAnchor, "MediaRevoked")
        .withArgs(anyValue, owner.address, anyValue);
    });

    it("Should allow consensus party to revoke", async function () {
      await expect(mediaAnchor.connect(user1).revokeMedia(sampleMediaHash))
        .to.emit(mediaAnchor, "MediaRevoked");
    });

    it("Should prevent unauthorized revocation", async function () {
      await expect(
        mediaAnchor.connect(user3).revokeMedia(sampleMediaHash)
      ).to.be.revertedWith("Not authorized to revoke");
    });

    it("Should update verification status after revocation", async function () {
      await mediaAnchor.connect(owner).revokeMedia(sampleMediaHash);
      
      const [exists, isValid] = await mediaAnchor.verifyMedia(sampleMediaHash);
      expect(exists).to.be.true;
      expect(isValid).to.be.false;
    });
  });

  describe("Dispute Resolution", function () {
    beforeEach(async function () {
      await anchorFull(owner, sampleMediaHash, [user1.address]);
      await mediaAnchor.connect(user3).disputeMedia(sampleMediaHash, "Fake video");
    });

    it("Should allow owner to resolve a dispute (reject)", async function () {
      await expect(mediaAnchor.connect(owner).resolveDispute(sampleMediaHash, 0, false))
        .to.emit(mediaAnchor, "DisputeResolved");

      // Status should be restored to Verified
      const [, isValid] = await mediaAnchor.verifyMedia(sampleMediaHash);
      expect(isValid).to.be.true;
    });

    it("Should allow owner to uphold a dispute", async function () {
      await mediaAnchor.connect(owner).resolveDispute(sampleMediaHash, 0, true);

      const [, isValid] = await mediaAnchor.verifyMedia(sampleMediaHash);
      expect(isValid).to.be.false;
    });

    it("Should reject non-owner resolving a dispute", async function () {
      await expect(
        mediaAnchor.connect(user1).resolveDispute(sampleMediaHash, 0, false)
      ).to.be.revertedWithCustomError(mediaAnchor, "OwnableUnauthorizedAccount");
    });

    it("Should reject resolving already-resolved dispute", async function () {
      await mediaAnchor.connect(owner).resolveDispute(sampleMediaHash, 0, false);
      await expect(
        mediaAnchor.connect(owner).resolveDispute(sampleMediaHash, 0, false)
      ).to.be.revertedWith("Dispute already resolved");
    });
  });

  describe("Pausable", function () {
    it("Should allow owner to pause and unpause", async function () {
      await mediaAnchor.connect(owner).pause();
      
      await expect(
        anchorFull(owner, sampleMediaHash, [user1.address])
      ).to.be.revertedWithCustomError(mediaAnchor, "EnforcedPause");

      await mediaAnchor.connect(owner).unpause();

      // Should work again after unpause
      await expect(anchorFull(owner, sampleMediaHash, [user1.address]))
        .to.emit(mediaAnchor, "MediaAnchored");
    });

    it("Should prevent non-owner from pausing", async function () {
      await expect(
        mediaAnchor.connect(user1).pause()
      ).to.be.revertedWithCustomError(mediaAnchor, "OwnableUnauthorizedAccount");
    });
  });
});
