const express = require("express");
const app = express();
const { v4: uuidv4 } = require('uuid');
const pool = require("./db");
const multer = require("multer");
const cors = require("cors");
require("dotenv").config();
const s3 = require("./s3");
const removeBackground = require("./removeBackground");
const scrapeProductImages = require("./scrapeProductImages");
const { generateTryOnImage } = require("./geminiTryOn");
const axios = require("axios");
const sharp = require("sharp");
const { verifyAppleToken } = require("./auth/apple");
const { createToken, verifyToken } = require("./auth/jwt");
const serverless = require("serverless-http");

app.use(cors({
  origin: "*"
}));

// Webhook endpoint needs raw body
app.use("/payment/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

if (process.env.NODE_ENV !== "production") {
  // Listen on all network interfaces (0.0.0.0) so mobile devices can connect
  app.listen(3000, '0.0.0.0', () => {
    console.log("Server running on http://0.0.0.0:3000");
    console.log("Access from your phone at http://192.168.0.119:3000");
  });
}


app.get("/", (req, res) => {
  res.json({ status: "OK", message: "TryOn API is running" });
});


app.post("/auth/apple", async (req, res) => {
  try {
    const { identityToken } = req.body;

    const appleUser = await verifyAppleToken(identityToken);
    const appleUserId = appleUser.sub;
    const email = appleUser.email || null;

    let user = await pool.query(
      "SELECT id FROM users WHERE apple_user_id = $1",
      [appleUserId]
    );

    if (user.rows.length === 0) {
      user = await pool.query(
        `
        INSERT INTO users (id, apple_user_id, email, available_tryons)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [uuidv4(), appleUserId, email, 3]
      );
    }

    const token = createToken(user.rows[0].id);

    res.json({ token });

  } catch (err) {
    console.error("APPLE AUTH ERROR:", err);
    res.status(401).json({ error: "Authentication failed" });
  }
});

app.post("/wardrobe/item", verifyToken, async (req, res) => {

  try {
    const { category } = req.body;

    // Check wardrobe limit (max 15 items)
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM wardrobe_items WHERE user_id = $1`,
      [req.userId]
    );

    const currentCount = parseInt(countResult.rows[0].count);
    const MAX_WARDROBE_ITEMS = 15;

    if (currentCount >= MAX_WARDROBE_ITEMS) {
      return res.status(400).json({
        error: `Wardrobe limit reached. You can only have ${MAX_WARDROBE_ITEMS} items. Please delete some items before adding new ones.`,
        current_count: currentCount,
        max_count: MAX_WARDROBE_ITEMS
      });
    }

    const id = uuidv4();

    console.log("Creating wardrobe item...");

    await pool.query(
        `
        INSERT INTO wardrobe_items (id, user_id, category)
        VALUES ($1, $2, $3)
        `,
        [id, req.userId, category]
        );

    console.log(`✅ Created wardrobe item: ${id} (${currentCount + 1}/${MAX_WARDROBE_ITEMS})`);

    res.json({ wardrobe_item_id: id });
  } catch (err) {
    console.error("DB ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});



// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + "-" + file.originalname);
//   }
// });

// const upload = multer({ storage });
const upload = multer({
  storage: multer.memoryStorage()
});


app.post(
  "/wardrobe/image",
  verifyToken,
  upload.fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      console.log("📥 Received upload request");
      console.log("Body:", req.body);
      console.log("Files:", req.files);

      const { wardrobe_item_id } = req.body;

      if (!wardrobe_item_id) {
        console.error("❌ Missing wardrobe_item_id");
        return res.status(400).json({ error: "wardrobe_item_id is required" });
      }

      const frontFile = req.files?.front?.[0];
      const backFile = req.files?.back?.[0];

      console.log("Front file:", frontFile ? "✅" : "❌");
      console.log("Back file:", backFile ? "✅" : "❌");

      if (!frontFile || !backFile) {
        console.error("❌ Missing images - front:", !!frontFile, "back:", !!backFile);
        return res.status(400).json({
          error: "Both front and back images are required",
        });
      }

      // 🔴 VERIFY OWNERSHIP FIRST
      const owner = await pool.query(
        `SELECT 1 FROM wardrobe_items WHERE id = $1 AND user_id = $2`,
        [wardrobe_item_id, req.userId]
      );

      if (owner.rows.length === 0) {
        console.error("❌ Unauthorized - item doesn't belong to user");
        return res.status(403).json({ error: "Unauthorized" });
      }

      // 🔴 CHECK IF ALREADY EXISTS
      const existing = await pool.query(
        `
        SELECT view,
            COALESCE(processed_path, raw_path) AS file_path,
            status
        FROM wardrobe_images
        WHERE wardrobe_item_id = $1
        `,
        [wardrobe_item_id]
      );

      if (existing.rows.length > 0) {
        console.error("❌ Images already exist for this item");
        return res.status(400).json({
          error: "Images already uploaded for this item",
        });
      }

      console.log("✅ Starting upload for both images...");

      // ✅ UPLOAD BOTH IMAGES
      const uploads = [
        { file: frontFile, view: "front" },
        { file: backFile, view: "back" }
      ];

      for (const img of uploads) {
        console.log(`\n📸 Processing ${img.view} image...`);
        const imageId = uuidv4();

        // Try background removal, fallback to original if it fails
        let imageBuffer;
        try {
          if (process.env.REMOVEBGAPIKEY) {
            console.log(`🎨 Removing background for ${img.view}...`);
            imageBuffer = await removeBackground(img.file.buffer);
            console.log(`✅ Background removed for ${img.view}`);
          } else {
            console.log("⚠️ No REMOVEBGAPIKEY found, skipping background removal");
            imageBuffer = img.file.buffer;
          }
        } catch (bgError) {
          console.error(`⚠️ Background removal failed for ${img.view}:`, bgError.message);
          console.log("📸 Using original image instead");
          imageBuffer = img.file.buffer;
        }

        const s3Key = `raw/${req.userId}/wardrobe/${wardrobe_item_id}/${img.view}.jpg`;
        console.log(`📤 Uploading ${img.view} to S3: ${s3Key}`);

        await s3.upload({
          Bucket: process.env.S3BUCKETNAME,
          Key: s3Key,
          Body: imageBuffer,
          ContentType: img.file.mimetype,
        }).promise();

        console.log(`✅ ${img.view} uploaded to S3`);

        await pool.query(
            `
            INSERT INTO wardrobe_images
            (id, wardrobe_item_id, user_id, view, raw_path, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [imageId, wardrobe_item_id, req.userId, img.view, s3Key, "uploaded"]
            );

        console.log(`✅ ${img.view} saved to database`);
      }

      console.log("\n🎉 Both images uploaded successfully!");


      res.json({
        message: "✅ Front & Back images uploaded successfully"
      });

    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

app.get("/auth/me", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, created_at, available_tryons, user_tier
       FROM users WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    // Count wardrobe items
    const wardrobeCount = await pool.query(
      "SELECT COUNT(*) as count FROM wardrobe_items WHERE user_id = $1",
      [req.userId]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        wardrobe_count: parseInt(wardrobeCount.rows[0].count),
        available_tryons: user.available_tryons || 0,
        user_tier: user.user_tier || 'free',
      }
    });
  } catch (err) {
    console.error("GET USER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


app.post("/auth/logout", verifyToken, async (req, res) => {
  try {
    // Optional: Log the logout event in database
    await pool.query(
      `INSERT INTO user_sessions (user_id, action, timestamp)
       VALUES ($1, $2, NOW())`,
      [req.userId, "logout"]
    );

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("LOGOUT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});







// Virtual Try-On Endpoint - ASYNC VERSION (Returns immediately, processes in background)
app.post(
  "/tryon/generate",
  verifyToken,
  upload.fields([
    { name: "person_image", maxCount: 1 },
    { name: "clothing_image", maxCount: 1 },
  ]),
  async (req, res) => {
    let generatedImageId = null;

    try {
      const { wardrobe_item_id, clothing_type } = req.body;

      console.log("🎨 Virtual Try-On Request:", {
        userId: req.userId,
        wardrobeItemId: wardrobe_item_id,
        clothingType: clothing_type,
      });

      // Check available credits
      const userResult = await pool.query(
        `SELECT available_tryons FROM users WHERE id = $1`,
        [req.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = userResult.rows[0];
      const availableTryons = user.available_tryons || 0;

      // Check if user has credits
      if (availableTryons <= 0) {
        return res.status(403).json({
          error: "No try-ons available. Please purchase more credits to continue.",
          available_tryons: 0,
        });
      }

      // Validate inputs
      if (!req.files?.person_image) {
        return res.status(400).json({
          error: "person_image is required",
        });
      }

      if (!clothing_type || !["top", "bottom"].includes(clothing_type)) {
        return res.status(400).json({
          error: "clothing_type must be 'top' or 'bottom'",
        });
      }

      const personImageBuffer = req.files.person_image[0].buffer;

      // Handle clothing image - can be either file upload or base64 string
      let clothingImageBuffer;

      if (req.files?.clothing_image) {
        clothingImageBuffer = req.files.clothing_image[0].buffer;
        console.log("📦 Clothing image received as file upload");
      } else if (req.body.clothing_image_base64) {
        console.log("📦 Clothing image received as base64 string");
        clothingImageBuffer = Buffer.from(req.body.clothing_image_base64, 'base64');
      } else {
        return res.status(400).json({
          error: "clothing_image (file) or clothing_image_base64 (string) is required",
        });
      }

      console.log(`📊 Received buffers: Person=${personImageBuffer.length}B, Clothing=${clothingImageBuffer.length}B`);

      if (personImageBuffer.length === 0 || clothingImageBuffer.length === 0) {
        return res.status(400).json({
          error: "Image buffers are empty. Please ensure images are properly uploaded.",
        });
      }

      // Upload original images to S3
      const personImageKey = `tryon/${req.userId}/person/${uuidv4()}.jpg`;
      const clothingImageKey = `tryon/${req.userId}/clothing/${uuidv4()}.jpg`;

      console.log("📤 Uploading source images to S3...");

      await Promise.all([
        s3.upload({
          Bucket: process.env.S3BUCKETNAME,
          Key: personImageKey,
          Body: personImageBuffer,
          ContentType: "image/jpeg",
        }).promise(),
        s3.upload({
          Bucket: process.env.S3BUCKETNAME,
          Key: clothingImageKey,
          Body: clothingImageBuffer,
          ContentType: "image/jpeg",
        }).promise(),
      ]);

      console.log("✅ Source images uploaded");

      // Create prompt for Gemini
      const prompt = `Create a realistic virtual try-on image. Show the person wearing the ${clothing_type}. Maintain the person's pose, body shape, and background. The clothing should fit naturally and look realistic.`;

      // Create database record with PENDING status
      generatedImageId = uuidv4();
      await pool.query(
        `INSERT INTO generated_images
         (id, user_id, person_image_path, wardrobe_item_id, clothing_image_path, status, prompt_used)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          generatedImageId,
          req.userId,
          personImageKey,
          wardrobe_item_id || null,
          clothingImageKey,
          "pending",
          prompt,
        ]
      );

      console.log(`✅ Job created: ${generatedImageId} - Status: pending`);

      // Return immediately with job ID
      res.json({
        success: true,
        message: "Virtual try-on job created. Processing in background.",
        generated_image_id: generatedImageId,
        status: "pending",
        note: "Poll /tryon/status/:id to check progress"
      });

      // Process in background (don't await)
      setImmediate(async () => {
        try {
          console.log(`🔄 Starting background processing for: ${generatedImageId}`);

          // Update to processing
          await pool.query(
            `UPDATE generated_images SET status = 'processing', updated_at = NOW() WHERE id = $1`,
            [generatedImageId]
          );

          const startTime = Date.now();

          // Generate try-on image using Gemini API
          const generatedImageBuffer = await generateTryOnImage(
            personImageBuffer,
            clothingImageBuffer,
            clothing_type
          );

          // Upload generated image to S3
          const resultImageKey = `tryon/${req.userId}/results/${generatedImageId}.jpg`;

          await s3.upload({
            Bucket: process.env.S3BUCKETNAME,
            Key: resultImageKey,
            Body: generatedImageBuffer,
            ContentType: "image/jpeg",
          }).promise();

          const generationTime = Date.now() - startTime;

          // Update database record
          await pool.query(
            `UPDATE generated_images
             SET result_image_path = $1, status = $2, generation_time_ms = $3, updated_at = NOW()
             WHERE id = $4`,
            [resultImageKey, "completed", generationTime, generatedImageId]
          );

          // Decrement available try-ons
          const updateResult = await pool.query(
            `UPDATE users SET available_tryons = available_tryons - 1 WHERE id = $1 RETURNING available_tryons`,
            [req.userId]
          );

          const remainingCredits = updateResult.rows[0]?.available_tryons || 0;
          console.log(`💳 Credits decremented. Remaining: ${remainingCredits}`);
          console.log(`✅ Background processing completed in ${generationTime}ms`);
        } catch (bgError) {
          console.error(`❌ Background processing error:`, bgError);
          await pool.query(
            `UPDATE generated_images
             SET status = $1, error_message = $2, updated_at = NOW()
             WHERE id = $3`,
            ["failed", bgError.message, generatedImageId]
          );
        }
      });

    } catch (err) {
      console.error("❌ VIRTUAL TRY-ON ERROR:", err);

      if (generatedImageId) {
        await pool.query(
          `UPDATE generated_images
           SET status = $1, error_message = $2, updated_at = NOW()
           WHERE id = $3`,
          ["failed", err.message, generatedImageId]
        );
      }

      res.status(500).json({
        error: "Failed to create virtual try-on job",
        message: err.message,
      });
    }
  }
);

// Check status of a virtual try-on job
app.get("/tryon/status/:imageId", verifyToken, async (req, res) => {
  try {
    const { imageId } = req.params;

    const result = await pool.query(
      `SELECT
        id,
        status,
        result_image_path,
        error_message,
        generation_time_ms,
        created_at,
        updated_at
       FROM generated_images
       WHERE id = $1 AND user_id = $2`,
      [imageId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = result.rows[0];

    // If completed, generate signed URL
    let resultUrl = null;
    if (job.status === 'completed' && job.result_image_path) {
      resultUrl = s3.getSignedUrl("getObject", {
        Bucket: process.env.S3BUCKETNAME,
        Key: job.result_image_path,
        Expires: 60 * 60 * 24, // 24 hours
      });
    }

    res.json({
      id: job.id,
      status: job.status,
      result_url: resultUrl,
      error_message: job.error_message,
      generation_time_ms: job.generation_time_ms,
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  } catch (err) {
    console.error("CHECK STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get all generated try-on images for a user
app.get("/tryon/images", verifyToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT
        id,
        person_image_path,
        clothing_image_path,
        result_image_path,
        status,
        created_at,
        generation_time_ms
       FROM generated_images
       WHERE user_id = $1 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    // Generate signed URLs for all images
    const images = result.rows.map((row) => {
      let resultUrl = null;
      if (row.result_image_path) {
        resultUrl = s3.getSignedUrl("getObject", {
          Bucket: process.env.S3BUCKETNAME,
          Key: row.result_image_path,
          Expires: 60 * 60 * 24, // 24 hours
        });
      }

      return {
        id: row.id,
        result_url: resultUrl,
        created_at: row.created_at,
        generation_time_ms: row.generation_time_ms,
      };
    });

    res.json({ images });
  } catch (err) {
    console.error("FETCH GENERATED IMAGES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a generated image
app.delete("/tryon/:imageId", verifyToken, async (req, res) => {
  try {
    const { imageId } = req.params;

    // Get image paths
    const result = await pool.query(
      `SELECT person_image_path, clothing_image_path, result_image_path
       FROM generated_images
       WHERE id = $1 AND user_id = $2`,
      [imageId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    const { person_image_path, clothing_image_path, result_image_path } = result.rows[0];

    // Delete from S3
    const deletePromises = [person_image_path, clothing_image_path, result_image_path]
      .filter(Boolean)
      .map((key) =>
        s3.deleteObject({
          Bucket: process.env.S3BUCKETNAME,
          Key: key,
        }).promise()
      );

    await Promise.all(deletePromises);

    // Delete from database
    await pool.query(
      `DELETE FROM generated_images WHERE id = $1`,
      [imageId]
    );

    res.json({ message: "Generated image deleted successfully" });
  } catch (err) {
    console.error("DELETE GENERATED IMAGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/wardrobe/:wardrobe_item_id/images", verifyToken, async (req, res) => {
  try {
    const { wardrobe_item_id } = req.params;

    // 1️⃣ Fetch images from Postgres
    const result = await pool.query(
      `
      SELECT
        view,
        COALESCE(processed_path, raw_path) AS file_path
        FROM wardrobe_images
        WHERE wardrobe_item_id = $1 AND user_id = $2
      `,
      [wardrobe_item_id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "No images found for this wardrobe item",
      });
    }

    // 2️⃣ Generate signed URLs
    const images = {};

    for (const row of result.rows) {
      const signedUrl = s3.getSignedUrl("getObject", {
        Bucket: process.env.S3BUCKETNAME,
        Key: row.file_path,
        Expires: 60 * 10, // 10 minutes
      });

      images[row.view] = signedUrl;
    }

    // 3️⃣ Return response
    res.json({
      wardrobe_item_id,
      images,
    });

  } catch (err) {
    console.error("FETCH IMAGES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/wardrobe", verifyToken, async (req, res) => {
  try {
    const { category } = req.query; // Optional filter by category

    // Build query with optional category filter
    let query = `
      SELECT
        wi.id,
        wi.category,
        wi.created_at,
        json_agg(
          json_build_object(
            'view', wimg.view,
            'path', COALESCE(wimg.processed_path, wimg.raw_path)
          )
        ) FILTER (WHERE wimg.id IS NOT NULL) as images
      FROM wardrobe_items wi
      LEFT JOIN wardrobe_images wimg ON wi.id = wimg.wardrobe_item_id
      WHERE wi.user_id = $1
    `;

    const params = [req.userId];

    if (category) {
      query += ` AND wi.category = $2`;
      params.push(category);
    }

    query += `
      GROUP BY wi.id, wi.category, wi.created_at
      ORDER BY wi.created_at DESC
    `;

    const result = await pool.query(query, params);

    // Generate signed URLs for each image
    const itemsWithSignedUrls = result.rows.map(item => {
      const images = {};

      if (item.images && item.images.length > 0) {
        item.images.forEach(img => {
          if (img.path) {
            const signedUrl = s3.getSignedUrl("getObject", {
              Bucket: process.env.S3BUCKETNAME,
              Key: img.path,
              Expires: 60 * 10, // 10 minutes
            });
            images[img.view] = signedUrl;
          }
        });
      }

      return {
        id: item.id,
        category: item.category,
        created_at: item.created_at,
        images,
      };
    });

    res.json(itemsWithSignedUrls);
  } catch (err) {
    console.error("WARDROBE FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE wardrobe item and its images
app.delete("/wardrobe/:itemId", verifyToken, async (req, res) => {
  try {
    const { itemId } = req.params;

    console.log(`🗑️ Delete request for item: ${itemId}`);

    // 1️⃣ Verify ownership
    const owner = await pool.query(
      `SELECT 1 FROM wardrobe_items WHERE id = $1 AND user_id = $2`,
      [itemId, req.userId]
    );

    if (owner.rows.length === 0) {
      console.error("❌ Unauthorized delete attempt");
      return res.status(403).json({ error: "Unauthorized" });
    }

    // 2️⃣ Get all image paths from database
    const images = await pool.query(
      `SELECT COALESCE(processed_path, raw_path) as path
       FROM wardrobe_images
       WHERE wardrobe_item_id = $1`,
      [itemId]
    );

    console.log(`📸 Found ${images.rows.length} images to delete from S3`);

    // 3️⃣ Delete images from S3
    for (const img of images.rows) {
      if (img.path) {
        try {
          await s3.deleteObject({
            Bucket: process.env.S3BUCKETNAME,
            Key: img.path,
          }).promise();
          console.log(`✅ Deleted from S3: ${img.path}`);
        } catch (s3Error) {
          console.error(`⚠️ Failed to delete from S3: ${img.path}`, s3Error.message);
          // Continue even if S3 delete fails
        }
      }
    }

    // 4️⃣ Delete from database
    // First delete wardrobe_images (child records)
    await pool.query(
      `DELETE FROM wardrobe_images WHERE wardrobe_item_id = $1`,
      [itemId]
    );
    console.log(`✅ Deleted wardrobe_images from database`);

    // Then delete wardrobe_items (parent record)
    await pool.query(
      `DELETE FROM wardrobe_items WHERE id = $1`,
      [itemId]
    );
    console.log(`✅ Deleted wardrobe_item from database`);

    res.json({
      success: true,
      message: "Wardrobe item deleted successfully"
    });

  } catch (err) {
    console.error("DELETE WARDROBE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// Scrape product images for immediate use (no wardrobe save)
app.post("/scrape-product", verifyToken, async (req, res) => {
  try {
    const { product_url } = req.body;

    console.log("🔍 Scrape product request:", product_url);

    if (!product_url) {
      return res.status(400).json({
        error: "product_url is required"
      });
    }

    // 1️⃣ Scrape images from product page
    console.log("🔍 Scraping product images...");
    const imageUrls = await scrapeProductImages(product_url);

    if (imageUrls.length < 1) {
      return res.status(400).json({
        error: "Could not extract images from product page. Please try a different link."
      });
    }

    console.log(`✅ Found ${imageUrls.length} images`);

    // 2️⃣ Download, optimize, and return images as base64 (for immediate use)
    const images = [];

    for (let i = 0; i < Math.min(2, imageUrls.length); i++) {
      console.log(`📥 Downloading image ${i + 1}...`);

      const imageResponse = await axios.get(imageUrls[i], {
        responseType: "arraybuffer",
        timeout: 10000,
      });

      const imageBuffer = Buffer.from(imageResponse.data);

      // Optimize image: convert to JPG with high quality, resize if too large
      const optimizedBuffer = await sharp(imageBuffer)
        .resize(1200, 1600, {
          fit: 'inside',
          withoutEnlargement: true, // Don't upscale small images
        })
        .jpeg({ quality: 95 }) // High quality JPEG
        .toBuffer();

      // Convert to base64 for easy transfer
      const base64Image = optimizedBuffer.toString('base64');

      images.push({
        data: `data:image/jpeg;base64,${base64Image}`,
        url: imageUrls[i],
        size: optimizedBuffer.length
      });

      console.log(`✅ Image ${i + 1} downloaded and optimized (${(optimizedBuffer.length / 1024).toFixed(0)}KB)`);
    }

    console.log("🎉 Product images scraped successfully!");

    res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (err) {
    console.error("SCRAPE PRODUCT ERROR:", err);
    res.status(500).json({
      error: "Failed to scrape product images. Please check the URL and try again.",
      details: err.message
    });
  }
});


// Import product from link (creates wardrobe item + scrapes images)
app.post("/wardrobe/import-link", verifyToken, async (req, res) => {
  try {
    const { product_url, category } = req.body;

    console.log("📦 Import from link request:", { product_url, category });

    if (!product_url || !category) {
      return res.status(400).json({
        error: "product_url and category are required"
      });
    }

    if (!["top", "bottom"].includes(category)) {
      return res.status(400).json({
        error: "category must be 'top' or 'bottom'"
      });
    }

    // Check wardrobe limit (max 15 items)
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM wardrobe_items WHERE user_id = $1`,
      [req.userId]
    );

    const currentCount = parseInt(countResult.rows[0].count);
    const MAX_WARDROBE_ITEMS = 15;

    if (currentCount >= MAX_WARDROBE_ITEMS) {
      return res.status(400).json({
        error: `Wardrobe limit reached. You can only have ${MAX_WARDROBE_ITEMS} items. Please delete some items before adding new ones.`,
        current_count: currentCount,
        max_count: MAX_WARDROBE_ITEMS
      });
    }

    // 1️⃣ Create wardrobe item
    const wardrobeItemId = uuidv4();
    await pool.query(
      `INSERT INTO wardrobe_items (id, user_id, category) VALUES ($1, $2, $3)`,
      [wardrobeItemId, req.userId, category]
    );
    console.log(`✅ Created wardrobe item: ${wardrobeItemId} (${currentCount + 1}/${MAX_WARDROBE_ITEMS})`);

    // 2️⃣ Scrape images from product page
    console.log("🔍 Scraping product images...");
    const imageUrls = await scrapeProductImages(product_url);

    if (imageUrls.length < 2) {
      // Cleanup: delete the wardrobe item if scraping fails
      await pool.query(`DELETE FROM wardrobe_items WHERE id = $1`, [wardrobeItemId]);
      return res.status(400).json({
        error: "Could not extract enough images from product page. Please try a different link or upload manually."
      });
    }

    console.log(`✅ Found ${imageUrls.length} images`);

    const views = ["front", "back"];

    // 3️⃣ Process each image
    for (let i = 0; i < 2; i++) {
      console.log(`\n📸 Processing ${views[i]} image...`);

      // Download image
      const imageResponse = await axios.get(imageUrls[i], {
        responseType: "arraybuffer"
      });
      let imageBuffer = Buffer.from(imageResponse.data);

      // Try background removal, fallback to original if it fails
      try {
        if (process.env.REMOVEBGAPIKEY) {
          console.log(`🎨 Removing background for ${views[i]}...`);
          imageBuffer = await removeBackground(imageBuffer);
          console.log(`✅ Background removed for ${views[i]}`);
        } else {
          console.log("⚠️ No REMOVEBGAPIKEY found, skipping background removal");
        }
      } catch (bgError) {
        console.error(`⚠️ Background removal failed for ${views[i]}:`, bgError.message);
        console.log("📸 Using original image instead");
      }

      // Upload to S3
      const s3Key = `raw/${req.userId}/wardrobe/${wardrobeItemId}/${views[i]}.jpg`;
      console.log(`📤 Uploading ${views[i]} to S3: ${s3Key}`);

      await s3.upload({
        Bucket: process.env.S3BUCKETNAME,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: "image/jpeg"
      }).promise();

      console.log(`✅ ${views[i]} uploaded to S3`);

      // Save to database
      await pool.query(
        `
        INSERT INTO wardrobe_images
        (id, wardrobe_item_id, user_id, view, raw_path, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          uuidv4(),
          wardrobeItemId,
          req.userId,
          views[i],
          s3Key,
          "uploaded"
        ]
      );

      console.log(`✅ ${views[i]} saved to database`);
    }

    console.log("\n🎉 Product imported successfully!");

    res.json({
      success: true,
      message: "Product imported successfully",
      wardrobe_item_id: wardrobeItemId
    });

  } catch (err) {
    console.error("IMPORT LINK ERROR:", err);
    res.status(500).json({
      error: "Failed to import product. Please try again or upload manually.",
      details: err.message
    });
  }
});


// Legacy endpoint (kept for backward compatibility)
app.post("/wardrobe/link", verifyToken, async (req, res) => {
  try {
    const { wardrobe_item_id, product_url } = req.body;

    if (!wardrobe_item_id || !product_url) {
      return res.status(400).json({
        error: "wardrobe_item_id and product_url are required"
      });
    }

    // Verify ownership
    const owner = await pool.query(
      `SELECT 1 FROM wardrobe_items WHERE id = $1 AND user_id = $2`,
      [wardrobe_item_id, req.userId]
    );
    if (owner.rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check duplicate
    const existing = await pool.query(
      `SELECT 1 FROM wardrobe_images WHERE wardrobe_item_id = $1`,
      [wardrobe_item_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Images already exist for this wardrobe item"
      });
    }

    // Scrape images
    const imageUrls = await scrapeProductImages(product_url);

    if (imageUrls.length < 2) {
      return res.status(400).json({
        error: "Could not extract enough images from product page"
      });
    }

    const views = ["front", "back"];

    for (let i = 0; i < 2; i++) {
      const imageBuffer = await axios.get(imageUrls[i], {
        responseType: "arraybuffer"
      });

      // Remove background
      const bgRemovedBuffer = await removeBackground(
        Buffer.from(imageBuffer.data)
      );

      // Upload to S3
      const s3Key = `raw/${req.userId}/wardrobe/${wardrobe_item_id}/${views[i]}.png`;

      await s3.upload({
        Bucket: process.env.S3BUCKETNAME,
        Key: s3Key,
        Body: bgRemovedBuffer,
        ContentType: "image/png"
      }).promise();

      // Insert DB
      await pool.query(
        `
        INSERT INTO wardrobe_images
        (id, wardrobe_item_id, user_id, view, raw_path, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          uuidv4(),
          wardrobe_item_id,
          req.userId,
          views[i],
          s3Key,
          "uploaded"
        ]
      );
    }

    res.json({
      message: "✅ Product images imported successfully"
    });

  } catch (err) {
    console.error("LINK UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// Purchase credits endpoint (mock payment for now)
app.post("/payment/purchase", verifyToken, async (req, res) => {
  try {
    const { package_id, amount, tryons } = req.body;

    if (!package_id || !amount || !tryons) {
      return res.status(400).json({
        error: "Missing required fields: package_id, amount, tryons"
      });
    }

    console.log(`💳 Processing purchase for user ${req.userId}: ${package_id} (${tryons} try-ons)`);

    // Create payment order record
    const orderId = uuidv4();
    await pool.query(
      `INSERT INTO payment_orders (id, user_id, package_id, amount, tryons, status, payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, req.userId, package_id, amount, tryons, 'completed', `mock-payment-${Date.now()}`]
    );

    // Update user credits and tier
    const updateResult = await pool.query(
      `UPDATE users
       SET available_tryons = available_tryons + $1,
           user_tier = 'paid'
       WHERE id = $2
       RETURNING available_tryons, user_tier`,
      [tryons, req.userId]
    );

    const updatedUser = updateResult.rows[0];

    console.log(`✅ Purchase successful! User now has ${updatedUser.available_tryons} try-ons (tier: ${updatedUser.user_tier})`);

    res.json({
      success: true,
      message: "Purchase successful!",
      order_id: orderId,
      available_tryons: updatedUser.available_tryons,
      user_tier: updatedUser.user_tier,
    });

  } catch (err) {
    console.error("PURCHASE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// For Testing - Generate a test token without database
app.get("/auth/dev-token", async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Generate a token for a mock user ID
  const mockUserId = "dev-user-123";
  const token = createToken(mockUserId);

  res.json({
    token,
    message: "Use this token for local testing. Copy it and use it in your app.",
    userId: mockUserId
  });
});

// For Testing
app.post("/auth/dev", async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const userId = uuidv4();

  await pool.query(
    `
    INSERT INTO users (id, apple_user_id, email)
    VALUES ($1, $2, $3)
    `,
    [userId, `dev-${userId}`, "dev@test.com"]
  );

  const token = createToken(userId);

  res.json({ token });
});

// Export handler for AWS Lambda
module.exports = app;
