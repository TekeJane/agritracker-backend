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

function serializeComment(req, commentRecord) {
  const comment = commentRecord.toJSON ? commentRecord.toJSON() : commentRecord;

  if (comment.User?.profile_image) {
    comment.User.profile_image = buildUploadUrl(req, comment.User.profile_image);
  }

  return comment;
}

function serializePost(req, postRecord, reactionByPostId = new Map()) {
  const post = postRecord.toJSON ? postRecord.toJSON() : postRecord;

  if (post.User?.profile_image) {
    post.User.profile_image = buildUploadUrl(req, post.User.profile_image);
  }

  if (post.image_url) {
    post.image_url = buildUploadUrl(req, post.image_url);
  }

  if (Array.isArray(post.Comments)) {
    post.Comments = post.Comments.map((comment) => serializeComment(req, comment));
  }

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
    map.set(reaction.Post_id, reaction.comment_id === 0 ? 'dislike' : 'like');
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

    return res.json({
      success: true,
      data: postRecords.map((post) => serializePost(req, post, reactionByPostId)),
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
        message: 'You already reacted to this post',
      });
    }

    await Like.create({
      user_id: userId,
      Post_id: postId,
      comment_id: null,
    });

    postRecord.likes_count = (postRecord.likes_count || 0) + 1;
    await postRecord.save();

    return res.json({
      success: true,
      message: 'Post liked',
      likes: postRecord.likes_count,
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
        message: 'You already reacted to this post',
      });
    }

    await Like.create({
      user_id: userId,
      Post_id: postId,
      comment_id: 0,
    });

    postRecord.dislikes_count = (postRecord.dislikes_count || 0) + 1;
    await postRecord.save();

    return res.json({
      success: true,
      message: 'Post disliked',
      dislikes: postRecord.dislikes_count,
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
