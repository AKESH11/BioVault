const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MediaAnchor Contract", function () {
  let mediaAnchor;
  let owner, user1, user2, user3;
  
  const sampleMediaHash = "0x1234567890abcdef";
  const sampleBioSignature = "BPM:72|SIG:abc123";
  const sampleHardwareID = "PRNU:device123";
  const sampleIPFSHash = "QmTest123";

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
      
      await expect(
        mediaAnchor.connect(owner).anchorMedia(
          sampleMediaHash,
          sampleBioSignature,
          sampleHardwareID,
          consensusParties,
          sampleIPFSHash
        )
      )
        .to.emit(mediaAnchor, "MediaAnchored")
        .withArgs(sampleMediaHash, owner.address, expect.anything(), sampleHardwareID);
    });

    it("Should fail with empty media hash", async function () {
      await expect(
        mediaAnchor.anchorMedia("", sampleBioSignature, sampleHardwareID, [user1.address], sampleIPFSHash)
      ).to.be.revertedWith("Media hash cannot be empty");
    });

    it("Should fail with no consensus parties", async function () {
      await expect(
        mediaAnchor.anchorMedia(sampleMediaHash, sampleBioSignature, sampleHardwareID, [], sampleIPFSHash)
      ).to.be.revertedWith("At least one consensus party required");
    });

    it("Should fail when anchoring duplicate hash", async function () {
      const consensusParties = [user1.address];
      
      await mediaAnchor.anchorMedia(
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        consensusParties,
        sampleIPFSHash
      );

      await expect(
        mediaAnchor.anchorMedia(
          sampleMediaHash,
          sampleBioSignature,
          sampleHardwareID,
          consensusParties,
          sampleIPFSHash
        )
      ).to.be.revertedWith("Media already anchored");
    });
  });

  describe("Media Verification", function () {
    beforeEach(async function () {
      const consensusParties = [user1.address, user2.address];
      await mediaAnchor.anchorMedia(
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        consensusParties,
        sampleIPFSHash
      );
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
      const consensusParties = [user1.address, user2.address];
      
      await mediaAnchor.anchorMedia(
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        consensusParties,
        sampleIPFSHash
      );

      expect(await mediaAnchor.hasConsent(sampleMediaHash, user1.address)).to.be.true;
      expect(await mediaAnchor.hasConsent(sampleMediaHash, user2.address)).to.be.true;
      expect(await mediaAnchor.hasConsent(sampleMediaHash, user3.address)).to.be.false;
    });
  });

  describe("Disputes", function () {
    beforeEach(async function () {
      await mediaAnchor.anchorMedia(
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        [user1.address],
        sampleIPFSHash
      );
    });

    it("Should allow anyone to dispute media", async function () {
      await expect(
        mediaAnchor.connect(user3).disputeMedia(sampleMediaHash, "Fake video")
      )
        .to.emit(mediaAnchor, "MediaDisputed")
        .withArgs(sampleMediaHash, user3.address, "Fake video", expect.anything());
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
      await mediaAnchor.connect(owner).anchorMedia(
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        [user1.address],
        sampleIPFSHash
      );
    });

    it("Should allow creator to revoke", async function () {
      await expect(mediaAnchor.connect(owner).revokeMedia(sampleMediaHash))
        .to.emit(mediaAnchor, "MediaRevoked")
        .withArgs(sampleMediaHash, owner.address, expect.anything());
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
});
