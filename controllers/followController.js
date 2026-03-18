const { UserFollow } = require('../models');

exports.followUser = async (req, res) => {
  try {
    const followerId = req.user?.id;
    const followingId = parseInt(req.params.userId);

    if (!followerId || !followingId) {
      return res.status(400).json({ success: false, message: 'Invalid user IDs' });
    }

    if (followerId === followingId) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
    }

    const existing = await UserFollow.findOne({
      where: { follower_id: followerId, following_id: followingId },
    });

    if (existing) {
      return res.status(200).json({ success: true, message: 'Already following' });
    }

    await UserFollow.create({ follower_id: followerId, following_id: followingId });
    return res.status(201).json({ success: true, message: 'Followed user' });
  } catch (error) {
    console.error('Follow user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to follow user' });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const followerId = req.user?.id;
    const followingId = parseInt(req.params.userId);

    if (!followerId || !followingId) {
      return res.status(400).json({ success: false, message: 'Invalid user IDs' });
    }

    await UserFollow.destroy({
      where: { follower_id: followerId, following_id: followingId },
    });

    return res.status(200).json({ success: true, message: 'Unfollowed user' });
  } catch (error) {
    console.error('Unfollow user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to unfollow user' });
  }
};

exports.getFollowing = async (req, res) => {
  try {
    const followerId = req.user?.id;

    if (!followerId) {
      return res.status(400).json({ success: false, message: 'Invalid user' });
    }

    const rows = await UserFollow.findAll({
      where: { follower_id: followerId },
      attributes: ['following_id'],
    });

    const ids = rows.map((row) => row.following_id);
    return res.status(200).json({ success: true, data: ids });
  } catch (error) {
    console.error('Get following error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch following list' });
  }
};
