const path = require('path');
const { Op } = require('sequelize');

const { Post, User, Comment, Like } = require('../models');

function getHost(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function parseUserId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildUploadUrl(req, value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const host = getHost(req);

  if (/^https?:\/\//i.test(raw)) {
    const uploadsMatch = raw.match(/\/uploads\/(.+)$/i);
    if (uploadsMatch) {
      return `${host}/uploads/${uploadsMatch[1]}`;
    }

    return `${host}/uploads/${path.basename(raw)}`;
  }

  if (raw.startsWith('/uploads/')) {
    return `${host}${raw}`;
  }

  if (raw.startsWith('uploads/')) {
    return `${host}/${raw}`;
  }

  return `${host}/uploads/${path.basename(raw)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPostShareUrl(req, postId) {
  return `${getHost(req)}/api/posts/share/${postId}`;
}

function getPostReactionType(reactionRecord) {
  const marker = Number.parseInt(reactionRecord?.comment_id, 10);
  return marker === 0 ? 'dislike' : 'like';
}

async function getPostReactionSummary(postIds) {
  const summary = new Map();

  if (postIds.length === 0) {
    return summary;
  }

  const reactions = await Like.findAll({
    where: {
      Post_id: { [Op.in]: postIds },
    },
    attributes: ['Post_id', 'comment_id'],
  });

  for (const reaction of reactions) {
    const postId = reaction.Post_id;
    const current = summary.get(postId) || { likes: 0, dislikes: 0 };

    if (getPostReactionType(reaction) === 'dislike') {
      current.dislikes += 1;
    } else {
      current.likes += 1;
    }

    summary.set(postId, current);
  }

  return summary;
}

async function getSinglePostReactionSummary(postId) {
  const summary = await getPostReactionSummary([postId]);
  return summary.get(postId) || { likes: 0, dislikes: 0 };
}

function sortCommentsNewestFirst(comments) {
  return [...comments].sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function serializeComment(req, commentRecord) {
  const comment = commentRecord.toJSON ? commentRecord.toJSON() : commentRecord;

  if (comment.User?.profile_image) {
    comment.User.profile_image = buildUploadUrl(req, comment.User.profile_image);
  }

  return comment;
}

function serializePost(
  req,
  postRecord,
  reactionByPostId = new Map(),
  reactionSummaryByPostId = new Map(),
) {
  const post = postRecord.toJSON ? postRecord.toJSON() : postRecord;

  if (post.User?.profile_image) {
    post.User.profile_image = buildUploadUrl(req, post.User.profile_image);
  }

  if (post.image_url) {
    post.image_url = buildUploadUrl(req, post.image_url);
  }

  if (Array.isArray(post.Comments)) {
    post.Comments = sortCommentsNewestFirst(
      post.Comments.map((comment) => serializeComment(req, comment)),
    );
  }

  const reactionSummary = reactionSummaryByPostId.get(post.id);
  if (reactionSummary) {
    post.likes_count = reactionSummary.likes;
    post.dislikes_count = reactionSummary.dislikes;
  }

  post.share_url = buildPostShareUrl(req, post.id);
  post.user_reaction = reactionByPostId.get(post.id) || null;
  return post;
}

async function getReactionMapForPosts(userId, postIds) {
  const map = new Map();

  if (!userId || postIds.length === 0) {
    return map;
  }

  const reactions = await Like.findAll({
    where: {
      user_id: userId,
      Post_id: { [Op.in]: postIds },
    },
  });

  for (const reaction of reactions) {
    map.set(reaction.Post_id, getPostReactionType(reaction));
  }

  return map;
}

exports.getPosts = async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    const userId = parseUserId(req.query.user_id);
    const whereClause = {};

    if (category && category !== 'all') {
      whereClause.category = category;
    }

    if (search && search.trim()) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${search.trim()}%` } },
        { text: { [Op.like]: `%${search.trim()}%` } },
      ];
    }

    const order =
      sort === 'trending'
        ? [['likes_count', 'DESC'], ['createdAt', 'DESC']]
        : [['createdAt', 'DESC']];

    const postRecords = await Post.findAll({
      where: whereClause,
      order,
      include: [
        {
          model: User,
          attributes: ['id', 'full_name', 'profile_image', 'account_type'],
        },
        {
          model: Comment,
          include: {
            model: User,
            attributes: ['id', 'full_name', 'profile_image', 'account_type'],
          },
        },
      ],
    });

    const reactionByPostId = await getReactionMapForPosts(
      userId,
      postRecords.map((post) => post.id),
    );
    const reactionSummaryByPostId = await getPostReactionSummary(
      postRecords.map((post) => post.id),
    );

    return res.json({
      success: true,
      data: postRecords.map((post) =>
        serializePost(req, post, reactionByPostId, reactionSummaryByPostId),
      ),
    });
  } catch (error) {
    console.error('[Post] Error in getPosts:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

exports.createPost = async (req, res) => {
  try {
    const { user_id, title, text, category } = req.body;

    const newPost = await Post.create({
      user_id,
      title,
      text,
      category: category || 'general',
      image_url: req.file ? `/uploads/${req.file.filename}` : null,
    });

    const postWithUser = await Post.findByPk(newPost.id, {
      include: {
        model: User,
        attributes: ['id', 'full_name', 'profile_image', 'account_type'],
      },
    });

    return res.status(201).json({
      success: true,
      data: serializePost(req, postWithUser),
    });
  } catch (error) {
    console.error('[Post] Error in createPost:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create post',
      error: error.message,
    });
  }
};

exports.createComment = async (req, res) => {
  try {
    const { user_id, Post_id, post_id, text } = req.body;
    const resolvedPostId = Post_id || post_id;

    if (!resolvedPostId || !user_id || !text) {
      return res.status(400).json({
        success: false,
        message: 'post_id, user_id and text are required',
      });
    }

    const postRecord = await Post.findByPk(resolvedPostId);
    if (!postRecord) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const comment = await Comment.create({
      user_id,
      Post_id: resolvedPostId,
      text,
    });

    const commentWithUser = await Comment.findByPk(comment.id, {
      include: {
        model: User,
        attributes: ['id', 'full_name', 'profile_image', 'account_type'],
      },
    });

    return res.status(201).json({
      success: true,
      data: serializeComment(req, commentWithUser),
    });
  } catch (error) {
    console.error('[Post] Error in createComment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create comment',
      error: error.message,
    });
  }
};

exports.likePost = async (req, res) => {
  try {
    const userId = parseUserId(req.body.user_id);
    const postId = parseUserId(req.params.PostId);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
      });
    }

    const postRecord = await Post.findByPk(postId);
    if (!postRecord) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const existingReaction = await Like.findOne({
      where: { user_id: userId, Post_id: postId },
    });

    if (existingReaction) {
      return res.status(409).json({
        success: false,
        message:
          getPostReactionType(existingReaction) === 'like'
            ? 'You already liked this post'
            : 'You already disliked this post',
      });
    }

    await Like.create({
      user_id: userId,
      Post_id: postId,
      comment_id: null,
    });

    const reactionSummary = await getSinglePostReactionSummary(postId);
    postRecord.likes_count = reactionSummary.likes;
    postRecord.dislikes_count = reactionSummary.dislikes;
    await postRecord.save();

    return res.json({
      success: true,
      message: 'Post liked',
      likes: reactionSummary.likes,
      dislikes: reactionSummary.dislikes,
      reaction: 'like',
    });
  } catch (error) {
    console.error('[Post] Error in likePost:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to like post',
      error: error.message,
    });
  }
};

exports.likeComment = async (req, res) => {
  try {
    const userId = parseUserId(req.body.user_id);
    const commentId = parseUserId(req.params.commentId);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
      });
    }

    const commentRecord = await Comment.findByPk(commentId);
    if (!commentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    const existingLike = await Like.findOne({
      where: {
        user_id: userId,
        comment_id: commentId,
      },
    });

    if (existingLike) {
      return res.status(409).json({
        success: false,
        message: 'You already liked this comment',
      });
    }

    await Like.create({
      user_id: userId,
      comment_id: commentId,
    });

    commentRecord.likes_count = (commentRecord.likes_count || 0) + 1;
    await commentRecord.save();

    return res.json({
      success: true,
      message: 'Comment liked',
      likes: commentRecord.likes_count,
    });
  } catch (error) {
    console.error('[Post] Error in likeComment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to like comment',
      error: error.message,
    });
  }
};

exports.dislikePost = async (req, res) => {
  try {
    const userId = parseUserId(req.body.user_id);
    const postId = parseUserId(req.params.PostId);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
      });
    }

    const postRecord = await Post.findByPk(postId);
    if (!postRecord) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const existingReaction = await Like.findOne({
      where: { user_id: userId, Post_id: postId },
    });

    if (existingReaction) {
      return res.status(409).json({
        success: false,
        message:
          getPostReactionType(existingReaction) === 'dislike'
            ? 'You already disliked this post'
            : 'You already liked this post',
      });
    }

    await Like.create({
      user_id: userId,
      Post_id: postId,
      comment_id: 0,
    });

    const reactionSummary = await getSinglePostReactionSummary(postId);
    postRecord.likes_count = reactionSummary.likes;
    postRecord.dislikes_count = reactionSummary.dislikes;
    await postRecord.save();

    return res.json({
      success: true,
      message: 'Post disliked',
      likes: reactionSummary.likes,
      dislikes: reactionSummary.dislikes,
      reaction: 'dislike',
    });
  } catch (error) {
    console.error('[Post] Error in dislikePost:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to dislike post',
      error: error.message,
    });
  }
};

exports.sharePost = async (req, res) => {
  try {
    const postId = parseUserId(req.params.PostId);
    const postRecord = await Post.findByPk(postId);

    if (!postRecord) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    postRecord.shares_count = (postRecord.shares_count || 0) + 1;
    await postRecord.save();

    return res.json({
      success: true,
      message: 'Post shared',
      shares: postRecord.shares_count,
      share_url: buildPostShareUrl(req, postRecord.id),
      preview_image_url: buildUploadUrl(req, postRecord.image_url),
    });
  } catch (error) {
    console.error('[Post] Error in sharePost:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to share post',
      error: error.message,
    });
  }
};

exports.getPostSharePage = async (req, res) => {
  try {
    const postId = parseUserId(req.params.PostId || req.params.id);
    const postRecord = await Post.findByPk(postId, {
      include: [
        {
          model: User,
          attributes: ['id', 'full_name', 'profile_image', 'account_type'],
        },
        {
          model: Comment,
          include: {
            model: User,
            attributes: ['id', 'full_name', 'profile_image', 'account_type'],
          },
        },
      ],
    });

    if (!postRecord) {
      return res.status(404).send('<h1>Post not found</h1>');
    }

    const reactionByPostId = await getReactionMapForPosts(0, []);
    const reactionSummaryByPostId = await getPostReactionSummary([postId]);
    const post = serializePost(
      req,
      postRecord,
      reactionByPostId,
      reactionSummaryByPostId,
    );
    const authorName = escapeHtml(post.User?.full_name || 'AgriTracker member');
    const category = escapeHtml(post.category || 'community');
    const description = escapeHtml(
      post.text || post.title || 'Community update from AgriTracker.',
    );
    const pageTitle = escapeHtml(
      post.title || `${authorName}'s AgriTracker community post`,
    );
    const previewImage = post.image_url || '';
    const shareUrl = buildPostShareUrl(req, post.id);
    const commentCount = Array.isArray(post.Comments) ? post.Comments.length : 0;
    const imageMarkup = previewImage
      ? `<img src="${escapeHtml(previewImage)}" alt="${pageTitle}" style="width:100%;max-width:560px;height:320px;object-fit:cover;border-radius:24px;box-shadow:0 18px 40px rgba(15,23,42,0.16);" />`
      : '<div style="width:100%;max-width:560px;height:320px;border-radius:24px;background:linear-gradient(135deg,#dcfce7,#ecfccb);display:flex;align-items:center;justify-content:center;color:#166534;font-size:22px;font-weight:700;">AgriTracker Community</div>';

    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="AgriTracker" />
    <meta property="og:title" content="${pageTitle}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    ${previewImage ? `<meta property="og:image" content="${escapeHtml(previewImage)}" />` : ''}
    <meta name="twitter:card" content="${previewImage ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${pageTitle}" />
    <meta name="twitter:description" content="${description}" />
    ${previewImage ? `<meta name="twitter:image" content="${escapeHtml(previewImage)}" />` : ''}
  </head>
  <body style="margin:0;font-family:Arial,sans-serif;background:linear-gradient(180deg,#f7fee7 0%,#ffffff 55%);color:#0f172a;">
    <main style="max-width:820px;margin:0 auto;padding:40px 20px 56px;">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;font-size:13px;">AgriTracker Community Post</div>
      <h1 style="margin:18px 0 10px;font-size:38px;line-height:1.1;color:#14532d;">${pageTitle}</h1>
      <p style="margin:0 0 24px;font-size:17px;line-height:1.7;color:#475569;">${description}</p>
      ${imageMarkup}
      <section style="margin-top:28px;padding:24px;border-radius:24px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,0.08);">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:18px;">
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Author</div><div style="margin-top:6px;font-size:18px;font-weight:700;">${authorName}</div></div>
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Category</div><div style="margin-top:6px;font-size:18px;font-weight:700;">${category}</div></div>
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Likes</div><div style="margin-top:6px;font-size:18px;font-weight:700;">${post.likes_count || 0}</div></div>
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Comments</div><div style="margin-top:6px;font-size:18px;font-weight:700;">${commentCount}</div></div>
        </div>
      </section>
      <section style="margin-top:20px;padding:24px;border-radius:24px;background:#14532d;color:#f0fdf4;">
        <div style="font-size:18px;font-weight:700;">Open AgriTracker</div>
        <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#dcfce7;">Use the AgriTracker mobile app to react, comment, and join the conversation around this post.</p>
      </section>
    </main>
  </body>
</html>`);
  } catch (error) {
    console.error('[Post] Error in getPostSharePage:', error);
    return res.status(500).send('<h1>Unable to load post</h1>');
  }
};

exports.updatePost = async (req, res) => {
  try {
    const postId = parseUserId(req.params.PostId);
    const userId = parseUserId(req.body.user_id);
    const { title, text, category } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
      });
    }

    const postRecord = await Post.findByPk(postId);
    if (!postRecord) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (postRecord.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to edit this post',
      });
    }

    if (title !== undefined) postRecord.title = title;
    if (text !== undefined) postRecord.text = text;
    if (category !== undefined) postRecord.category = category;
    if (req.file) postRecord.image_url = `/uploads/${req.file.filename}`;

    await postRecord.save();

    const postWithUser = await Post.findByPk(postRecord.id, {
      include: {
        model: User,
        attributes: ['id', 'full_name', 'profile_image', 'account_type'],
      },
    });

    return res.json({
      success: true,
      data: serializePost(req, postWithUser),
    });
  } catch (error) {
    console.error('[Post] Error in updatePost:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update post',
      error: error.message,
    });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const postId = parseUserId(req.params.PostId);
    const userId = parseUserId(req.body.user_id || req.query.user_id);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required',
      });
    }

    const postRecord = await Post.findByPk(postId);
    if (!postRecord) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (postRecord.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post',
      });
    }

    await postRecord.destroy();

    return res.json({
      success: true,
      message: 'Post deleted',
    });
  } catch (error) {
    console.error('[Post] Error in deletePost:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete post',
      error: error.message,
    });
  }
};
