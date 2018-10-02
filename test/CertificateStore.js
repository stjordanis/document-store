const CertificateStore = artifacts.require("./CertificateStore.sol");
const { get } = require("lodash");
const BigNumber = require("bignumber.js");

const { expect } = require("chai")
  .use(require("chai-as-promised"))
  .use(require("chai-bignumber")(BigNumber));
const config = require("../config.js");

contract("CertificateStore", accounts => {
  let instance = null;

  // Related: https://github.com/trufflesuite/truffle-core/pull/98#issuecomment-360619561
  beforeEach(async () => {
    instance = await CertificateStore.new(config.INSTITUTE_NAME);
  });

  const issueCertificate = certificateMerkleRoot =>
    instance.issueCertificate(certificateMerkleRoot);

  describe("constructor", () => {
    it("should have correct name", async () => {
      const name = await instance.name();
      expect(name).to.be.equal(
        config.INSTITUTE_NAME,
        "Name of institute does not match"
      );
    });

    it("sets the owner properly", async () => {
      const owner = await instance.owner();
      expect(owner).to.be.equal(accounts[0]);
    });
  });

  describe("issueCertificate", () => {
    it("should be able to issue a certificate", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      const receipt = await issueCertificate(certificateMerkleRoot);

      // FIXME: Use a utility helper to watch for event
      expect(receipt.logs[0].event).to.be.equal(
        "CertificateIssued",
        "Certificate issued event not emitted."
      );
      expect(receipt.logs[0].args.certificate).to.be.equal(
        certificateMerkleRoot,
        "Incorrect event arguments emitted"
      );

      const issued = await instance.isCertificateIssued(certificateMerkleRoot);
      expect(issued, "Certificate is not issued").to.be.true;
    });

    it("should not allow duplicate issues", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      await issueCertificate(certificateMerkleRoot);

      // Check that reissue is rejected
      await expect(
        instance.issueCertificate(certificateMerkleRoot)
      ).to.be.rejectedWith(/revert/, "Duplicate issue was not rejected");
    });

    it("only allows the owner to issue", async () => {
      const nonOwner = accounts[1];
      const owner = await instance.owner();
      expect(nonOwner).to.not.be.equal(owner);

      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";

      await expect(
        instance.issueCertificate(certificateMerkleRoot, { from: nonOwner })
      ).to.be.rejectedWith(/revert/);
    });
  });

  describe("getIssuedBlock", () => {
    it("returns the block number of issued batches", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      await issueCertificate(certificateMerkleRoot);

      const blockNumber = await instance.getIssuedBlock(certificateMerkleRoot);
      expect(blockNumber).to.be.bignumber.greaterThan(0);
    });

    it("errors on unissued batch", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";

      // This test may fail on ganache-ui (works for ganache-cli)
      await expect(
        instance.getIssuedBlock(certificateMerkleRoot)
      ).to.be.rejectedWith(/revert/);
    });
  });

  describe("isCertificateIssued", () => {
    it("should return true for issued batch", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      await issueCertificate(certificateMerkleRoot);

      const issued = await instance.isCertificateIssued(certificateMerkleRoot);
      expect(issued, "Certificate batch is not issued").to.be.true;
    });

    it("should return false for certificate batch not issued", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";

      const issued = await instance.isCertificateIssued(certificateMerkleRoot);
      expect(issued, "Certificate batch is issued in error").to.be.false;
    });
  });

  describe("revokeCertificate", () => {
    it("should allow the revocation of a valid and issued certificate", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      const certificateHash =
        "0x10327d7f904ee3ee0e69d592937be37a33692a78550bd100d635cdea2344e6c7";

      await issueCertificate(certificateMerkleRoot);

      const receipt = await instance.revokeCertificate(certificateHash);

      // FIXME: Use a utility helper to watch for event
      expect(receipt.logs[0].event).to.be.equal("CertificateRevoked");
      expect(receipt.logs[0].args.certificate).to.be.equal(certificateHash);
    });

    it("should allow the revocation of an issued root", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      const certificateHash = certificateMerkleRoot;

      await issueCertificate(certificateMerkleRoot);

      const receipt = await instance.revokeCertificate(certificateHash);

      // FIXME: Use a utility helper to watch for event
      expect(receipt.logs[0].event).to.be.equal("CertificateRevoked");
      expect(receipt.logs[0].args.certificate).to.be.equal(certificateHash);
    });

    it("should not allow repeated revocation of a valid and issued certificate", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      const certificateHash =
        "0x10327d7f904ee3ee0e69d592937be37a33692a78550bd100d635cdea2344e6c7";

      await issueCertificate(certificateMerkleRoot);

      await instance.revokeCertificate(certificateHash);

      await expect(
        instance.revokeCertificate(certificateHash)
      ).to.be.rejectedWith(/revert/);
    });

    it("should allow revocation of an unissued certificate", async () => {
      const certificateHash =
        "0x10327d7f904ee3ee0e69d592937be37a33692a78550bd100d635cdea2344e6c7";

      const receipt = await instance.revokeCertificate(certificateHash);

      // FIXME: Use a utility helper to watch for event
      expect(receipt.logs[0].event).to.be.equal("CertificateRevoked");
      expect(receipt.logs[0].args.certificate).to.be.equal(certificateHash);
    });
  });

  describe("isRevoked", () => {
    it("returns true for revoked certificates", async () => {
      const certificateMerkleRoot =
        "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";
      const certificateHash =
        "0x10327d7f904ee3ee0e69d592937be37a33692a78550bd100d635cdea2344e6c7";

      await issueCertificate(certificateMerkleRoot);
      await instance.revokeCertificate(certificateHash);

      const revoked = await instance.isRevoked(certificateHash);
      expect(revoked).to.be.true;
    });

    it("returns true for non-revoked certificates", async () => {
      "0x3a267813bea8120f55a7b9ca814c34dd89f237502544d7c75dfd709a659f6330";

      const certificateHash =
        "0x10327d7f904ee3ee0e69d592937be37a33692a78550bd100d635cdea2344e6c7";

      const revoked = await instance.isRevoked(certificateHash);
      expect(revoked).to.be.false;
    });
  });

  describe("isRevokedBefore", () => {
    const certificateHash =
      "0x10327d7f904ee3ee0e69d592937be37a33692a78550bd100d635cdea2344e6c7";

    it("returns false for certificate revoked after the timestamp", async () => {
      const revokeReceipt = await instance.revokeCertificate(certificateHash);
      const revokedBlock = get(revokeReceipt, "receipt.blockNumber");
      const revoked = await instance.isRevokedBefore(
        certificateHash,
        revokedBlock - 1
      );
      expect(revoked).to.be.false;
    });

    it("returns true for certificate revoked at the timestamp", async () => {
      const revokeReceipt = await instance.revokeCertificate(certificateHash);
      const revokedBlock = get(revokeReceipt, "receipt.blockNumber");
      const revoked = await instance.isRevokedBefore(
        certificateHash,
        revokedBlock
      );
      expect(revoked).to.be.true;
    });

    it("returns true for certificate revoked before the timestamp", async () => {
      const revokeReceipt = await instance.revokeCertificate(certificateHash);
      const revokedBlock = get(revokeReceipt, "receipt.blockNumber");
      const revoked = await instance.isRevokedBefore(
        certificateHash,
        revokedBlock + 1
      );
      expect(revoked).to.be.true;
    });

    it("returns false for certificate not revoked, for arbitary timestamp", async () => {
      const revoked = await instance.isRevokedBefore(certificateHash, 1000);
      expect(revoked).to.be.false;
    });

    it("returns false for certificate not revoked, for block 0", async () => {
      const revoked = await instance.isRevokedBefore(certificateHash, 0);
      expect(revoked).to.be.false;
    });
  });

  describe("isCertificateIssuedBefore", () => {
    const certificateHash =
      "0x10327d7f904ee3ee0e69d592937be37a33692a78550bd100d635cdea2344e6c7";

    it("returns false for certificate issued after the timestamp", async () => {
      const issueReceipt = await instance.issueCertificate(certificateHash);
      const issuedBlock = get(issueReceipt, "receipt.blockNumber");
      const issued = await instance.isCertificateIssuedBefore(
        certificateHash,
        issuedBlock - 1
      );
      expect(issued).to.be.false;
    });

    it("returns true for certificate issued at the timestamp", async () => {
      const issueReceipt = await instance.issueCertificate(certificateHash);
      const issuedBlock = get(issueReceipt, "receipt.blockNumber");
      const issued = await instance.isCertificateIssuedBefore(
        certificateHash,
        issuedBlock
      );
      expect(issued).to.be.true;
    });

    it("returns true for certificate issued before the timestamp", async () => {
      const issueReceipt = await instance.issueCertificate(certificateHash);
      const issuedBlock = get(issueReceipt, "receipt.blockNumber");
      const issued = await instance.isCertificateIssuedBefore(
        certificateHash,
        issuedBlock + 1
      );
      expect(issued).to.be.true;
    });

    it("returns false for certificate not issued, for arbitary timestamp", async () => {
      const issued = await instance.isCertificateIssuedBefore(
        certificateHash,
        1000
      );
      expect(issued).to.be.false;
    });

    it("returns false for certificate not issued, for block 0", async () => {
      const issued = await instance.isCertificateIssuedBefore(
        certificateHash,
        0
      );
      expect(issued).to.be.false;
    });
  });
});
