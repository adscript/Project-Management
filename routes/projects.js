var express = require('express');
var router = express.Router();
const pool = require('../util/connect');
const isLoggedIn = require('../middleware/auth').isLoggedin;
const isAdmin = require('../middleware/auth').isAdmin;
const Project = require('../model/project');

// ==================================== LOAD PROJECT PAGE ===============================================================================
router.get('/', isLoggedIn, function (req, res) {
  let filterQuery = req.query.checkBox || [];

  let formFilter = [{ name: "ID", type: "number", value: req.query.ID, dbquery: "projects.projectid = $" },
  { name: "Name", type: "text", value: req.query.Name, dbquery: "POSITION( $ IN projects.name ) > 0" },
  { name: "Member", type: "select", select: ["opt1", "opt2", "opt3"], value: req.query.Member, dbquery: `projectid IN (SELECT projectid FROM members WHERE userid = $)`, selectitem: ['userid', 'fullname'] }];

  let currentPage = Number(req.query.page) || 1;
  let limit = 3;
  let offset = (currentPage - 1) * limit;
  let query = req.query;
  let loggedInUser = req.session.user;

  let projectModel = new Project(pool, formFilter, filterQuery, limit);
  const memberList = Project.getAllMember(pool);
  const totalProject = projectModel.getAllConstraint(loggedInUser).getNumofPage();
  const projectMemberList = projectModel.getProjectMemberList(offset);

  Promise.all([memberList, projectMemberList, totalProject]).then(results => {
    const [members, projects, totalProject] = results.map(element => element.rows);
    const totalPage = Math.ceil(totalProject[0].count / limit);
    formFilter[2].select = members;
    res.render('projects',
      {
        formOptions: ['ID', 'Name', 'Members'],
        filterQuery, formFilter, loggedInUser, query, currentPage, projects, totalPage,
        currentURL: "projects",
        optTable: "projectopt",
        url: req.url,
        messages: req.flash('berhasil')[0]
      }
    );
  }).catch(err => console.log(err));
});

// ========================================== APPLY OPTIONS ======================================================
router.post('/', (req, res) => {
  let [checkedID, checkedName, checkedMembers] = [false, false, false];
  if (req.body.checkopt) {
    if (!(req.body.checkopt instanceof Array))
      req.body.checkopt = [req.body.checkopt];
    checkedID = (req.body.checkopt.includes('ID'))
    checkedName = (req.body.checkopt.includes('Name'))
    checkedMembers = (req.body.checkopt.includes('Members'))
  }
  let options = [JSON.stringify({ "ID": checkedID, "Name": checkedName, "Members": checkedMembers }), req.session.user.userid];

  //model -> project.js
  //save options setting for user
  Project.updateOptions(pool, options).then(() => {
    req.session.user.projectopt = JSON.parse(options[0]);
    res.redirect('projects');
  }).catch(err => console.log(err));
})

// ============================== LOAD ADD PROJECT ==================================
router.get('/add', isLoggedIn, isAdmin, (req, res) => {
  Project.getAllMember(pool).then((memberList) => {
    res.render('projects/add', {
      loggedInUser: req.session.user,
      currentURL: 'projects',
      Members: memberList.rows,
      messages: req.flash('gagal')[0]
    });
  }).catch(err => console.log(err));
});

// =============================== POST ADD PROJECT ===================================
router.post('/add', (req, res) => {
  let message = [];
  (req.body.projectName) ? "" : message.push('Name');
  (req.body.checkBox) ? "" : message.push('Members');
  if (message.length > 0) {
    req.flash('gagal', `${message.join(' and ')} can't be empty`);
    res.redirect('/projects/add');
  } else {
    let countPage = new Project(pool);
    let usersid = (req.body.checkBox.length == 1) ? [req.body.checkBox] : req.body.checkBox;
    Project.addProject(pool, req.body.projectName).then(() => {
      Project.addMember(pool, usersid, req.body.projectName).then((messages) => {
        countPage.getNumofPage().then((count) => {
          let limit = 3;
          req.flash('berhasil', messages);
          res.redirect(`/projects?page=${Math.ceil(count.rows[0].count / limit)}`);
        }).catch(err => console.log(err));
      }).catch(err => console.log(err));
    }).catch(err => console.log(err));
  }
});

// ================================ GET EDIT PROJECT ======================================= 
router.get('/edit/:projectid', isLoggedIn, (req, res) => {
  const projectid = req.params.projectid;
  let loggedInUser = req.session.user;
  let allMembers = Project.getAllMember(pool);
  let allProjectData = Project.dataProject(pool, projectid);
  Promise.all([allMembers, allProjectData]).then((results) => {
    const [membersRow, projectData] = results;
    let Members = membersRow.rows;
    let projectName = projectData.projectName;
    let projectMembers = projectData.userid;
    let membersID = projectMembers.map(user => {
      return user.userid;
    })
    res.render('projects/edit', {
      currentURL: 'projects',
      loggedInUser, Members, projectName, projectMembers, membersID,
      messages: req.flash('gagal')[0]
    })
  }).catch(err => console.log(err));
});

// =================================== POST EDIT PROJECT ROUTER ================================
router.post('/edit/:projectid', (req, res) => {
  const projectid = req.params.projectid;
  let message = [];
  let loggedInUser = req.session.user;
  (req.body.projectName) ? "" : message.push('Name');
  (req.body.checkBox) ? "" : message.push('Members');
  if (message.length > 0) {
    req.flash('gagal', `${message.join(' and ')} can't be empty`);
    res.redirect('/projects/edit');
  } else {
    let countPage = new Project(pool);
    let membersArr = (req.body.checkBox.length == 1) ? [req.body.checkBox] : req.body.checkBox;
    Project.updateProjectName(pool, projectid, req.body.projectName).then(() => {
      Project.updateProjectMembers(pool, projectid, membersArr, req.body.projectName).then(messages => {
        countPage.getNumofPage(projectid, loggedInUser).then((count) => {
          let limit = 3;
          req.flash('berhasil', messages);
          res.redirect(`/projects?page=${Math.ceil(count.rows[0].count / limit)}`);
        }).catch(err => console.log(err));
      }).catch(err => console.log(err));
    }).catch(err => console.log(err));
  }
})


// ================================= DELETE PROJECT ====================================
router.get('/delete/:projectid', isLoggedIn, isAdmin, (req, res) => {
  const { projectid } = req.params;
  let countPage = new Project(pool);
  countPage.getNumofPage(projectid).then((count) => {
    Project.deleteProject(pool, projectid).then((messages) => {
      let limit = 3;
      req.flash('berhasil', messages);
      res.redirect(`/projects?page=${Math.ceil(count.rows[0].count / limit)}`);
    }).catch(err => console.log(err));
  }).catch(err => console.log(err));
});


// GET /projects/overview/:projectid
router.get('/overview:projectid', isLoggedIn, isAdmin, (req, res, next) => {
  let projectid = req.params.projectid;

  res.render('projects/overview/index', {
    currentURL: 'overview',
    loggedInUser: req.session.user
  });

});



// GET /projects/activity/:projectid

// =========================================== GET MEMBERS PAGE ====================================================
router.get('/members/:projectid', isLoggedIn, (req, res) => {
  let projectid = req.params.projectid;
  let filterQuery = req.query.checkBox || [];

  let objPosition = [{ 'value': 'Software Developer', 'display': 'Software Developer' }, { 'value': 'Manager', 'display': 'Manager' }, { 'value': 'Quality Assurance', 'display': 'Quality Assurance' }];
  let formFilter = [{ name: "ID", type: "number", value: req.query.ID, dbquery: "users.userid = $" },
  { name: "Name", type: "text", value: req.query.Name, dbquery: "POSITION( $ IN CONCAT(firstname,' ',lastname) ) > 0" },
  { name: "Position", type: "select", select: objPosition, value: req.query.Position, dbquery: `users.generalrole = $`, selectitem: ['value', 'display'] }];
  let formOptions = ['ID', 'Name', 'Position'];
  let loggedInUser = req.session.user;
  let currentPage = Number(req.query.page) || 1;
  let limit = 3;
  let offset = (currentPage - 1) * limit;
  let query = req.query;

  let countUser = Project.countUser(pool, formFilter, filterQuery, projectid);
  let memberList = Project.membersList(pool, formFilter, filterQuery, projectid, limit, offset);

  Promise.all([memberList, countUser]).then(results => {
    const [Members, totalMembers] = results.map(element => element.rows);
    const totalPage = Math.ceil(totalMembers[0].count / limit);
    res.render('projects/members', {
      formOptions, filterQuery, formFilter, loggedInUser, query, currentPage, Members, totalPage, projectid,
      currentURL: "members",
      optTable: "membersopt",
      url: req.url,
      messages: req.flash('berhasil')[0],
      addNotif: req.flash('failed')[0]
    })
  }).catch(err => console.log(err));
})

// ========================================== POST MEMBERS OVERVIEW OPTIONS ========================================================
router.post('/members/:projectid', (req, res) => {
  let projectid = req.params.projectid;
  let [checkedID, checkedName, checkedPosition] = [false, false, false];
  if (req.body.checkopt) {
    if (!(req.body.checkopt instanceof Array))
      req.body.checkopt = [req.body.checkopt];
    checkedID = (req.body.checkopt.includes('ID'));
    checkedName = (req.body.checkopt.includes('Name'));
    checkedPosition = (req.body.checkopt.includes('Position'));
  }
  let options = [JSON.stringify({ "ID": checkedID, "Name": checkedName, "Position": checkedPosition }), req.session.user.userid];
  //model -> project.js
  //save options setting for user
  Project.updateMembersOptions(pool, options).then(() => {
    req.session.user.membersopt = JSON.parse(options[0]);
    res.redirect(`/projects/members/${projectid}`);
  }).catch(err => console.log(err));
})

// ====================================== GET PROJECTS ADD MEMBERS IN OVERVIEW ==================================================
router.get('/members/:projectid/add', isLoggedIn, (req, res) => {
  let projectid = req.params.projectid;
  Project.userNotAssigned(pool, projectid).then(results => {
    let Users = results.rows;
    if (Users.length > 0) {
      res.render(`projects/members/add`, {
        currentURL: 'members',
        loggedInUser: req.session.user,
        projectid, Users,
        messages: req.flash('berhasil')[0]
      })
    } else {
      req.flash('failed', 'Cant Add More User, All Users assigned');
      res.redirect(`/projects/members/${projectid}`);
    }
  })
})

// POST /projects/members/:projectid/add
router.post('/members/:projectid/add', isLoggedIn, (req, res) => {
  let projectid = req.params.projectid;
  let userData = req.body;
  let limit = 3;
  Project.addUser(pool, userData, projectid).then(() => {
    Project.countMembersAssigned(pool, projectid).then((count) => {
      req.flash('berhasil', `User with id = ${userData.userid} added successfully`);
      res.redirect(`/projects/members/${projectid}?page=${Math.ceil(count.rows[0].count / limit)}`);
    })
  })
})

// GET /projects/members/:projectid/edit/:memberid
router.get('/members/:projectid/edit/:userid', isLoggedIn, (req, res) => {
  let { projectid, userid } = req.params;
  Project.renderMembers(pool, projectid, userid).then((result) => {
    let userData = result.rows[0];
    let loggedInUser = req.session.user;
    res.render('projects/members/edit', {
      userData, loggedInUser, projectid, userid,
      currentURL: 'members',
    });
  })
})


// POST /projects/members/:projectid/edit/:memberid
router.post('/members/:projectid/edit/:userid', isLoggedIn, (req, res) => {
  let { projectid, userid } = req.params;
  let { roleawal, role, memberid } = req.body;
  let limit = 3;
  Project.countBefore(pool, memberid, projectid).then(count => {
    let Page = Math.ceil(count.rows[0].count / limit);
    if (!role || role == roleawal) {
      req.flash('failed', `Position not changed`)
      res.redirect(`/projects/members/${projectid}?page=${Page}`)
    } else {
      Project.editMembers(pool, role, memberid).then(() => {
        req.flash('berhasil', `User position successfully changed from ${roleawal} to ${role}`)
        res.redirect(`/projects/members/${projectid}?page=${Page}`);
      })
    }
  })
})



// GET /projects/members/:projectid/delete/:memberid
router.get('/members/:projectid/delete/:memberid', isLoggedIn, (req, res) => {
  let { projectid, memberid } = req.params;
  let limit = 3;
  let Count = Project.countBefore(pool, memberid, projectid);
  let Deleted = Project.deleteMembers(pool, memberid);

  Promise.all([Count, Deleted]).then(results => {
    let Page = Math.ceil(results[0].rows[0].count / limit);
    req.flash('berhasil', `User Members Deleted Successfully`)
    res.redirect(`/projects/members/${projectid}?page=${Page}`);
  })

});


module.exports = router;